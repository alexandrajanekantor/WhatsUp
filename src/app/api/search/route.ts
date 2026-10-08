import { getUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai-config";
import { geocode } from "@/lib/geocode";
import { clientKey, rateLimit, tooMany } from "@/lib/rate-limit";
import { runSources } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchInputSchema } from "@/lib/types";

export const maxDuration = 300;

// Streams newline-delimited JSON: one message per source as it resolves, then a final merged list.
export async function POST(request: Request) {
  const parsed = searchInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid search" }, { status: 400 });
  const input = { ...parsed.data, deep: parsed.data.deep && aiEnabled() }; // live AI search only when AI is on

  const user = await getUser();
  const key = clientKey(request, user?.id);
  const limit = rateLimit(key, 20, 10 * 60 * 1000); // 20 searches / 10 min
  if (!limit.ok) return tooMany(limit.retryAfterSec);
  if (input.deep) {
    const deep = rateLimit(`${key}:deep`, 3, 10 * 60 * 1000); // live AI search costs real money: 3 / 10 min
    if (!deep.ok) return tooMany(deep.retryAfterSec);
  }

  const geo = await geocode(input.location);
  if (!geo) return Response.json({ error: "Couldn't find that location" }, { status: 404 });

  // Record the search in the user's history (logged-in users only).
  if (user) {
    const { location, startDate, endDate, radiusKm, ...filters } = input;
    await createAdminClient().from("searches").insert({
      user_id: user.id,
      location_text: location,
      lat: geo.lat,
      lng: geo.lng,
      radius_km: radiusKm,
      start_date: startDate,
      end_date: endDate,
      filters,
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "geo", geo });
      await runSources(input, geo, send);
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
