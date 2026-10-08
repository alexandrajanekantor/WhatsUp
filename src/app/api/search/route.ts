import { getUser } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { runSources } from "@/lib/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchInputSchema } from "@/lib/types";

export const maxDuration = 300;

// Streams newline-delimited JSON: one message per source as it resolves, then a final merged list.
export async function POST(request: Request) {
  const parsed = searchInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid search" }, { status: 400 });
  const input = parsed.data;

  const geo = await geocode(input.location);
  if (!geo) return Response.json({ error: "Couldn't find that location" }, { status: 404 });

  // Record the search in the user's history (logged-in users only).
  const user = await getUser();
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
