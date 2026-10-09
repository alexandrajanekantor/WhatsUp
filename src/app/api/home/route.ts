import { getUser, unauthorized } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runSources } from "@/lib/search";
import { timezoneAt, todayInTz } from "@/lib/time";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchInputSchema, type StreamMessage, type WhatsUpEvent } from "@/lib/types";

export const maxDuration = 300;

const FEED_TTL_MS = 12 * 3600 * 1000;

// The Home feed: events in the user's city over the next 7 days, matched to their default vibes.
// Serves a cached feed when it is fresh and the settings haven't changed; ?refresh=1 forces a rebuild.
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const db = createAdminClient();

  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile?.home_location || profile.home_lat == null || profile.home_lng == null) {
    return Response.json({ error: "Set your city first" }, { status: 409 });
  }

  const tz = timezoneAt(profile.home_lat, profile.home_lng);
  const input = searchInputSchema.parse({
    location: profile.home_location,
    startDate: todayInTz(tz, 0),
    endDate: todayInTz(tz, 7),
    radiusKm: profile.default_radius_km ?? 40,
    vibes: profile.default_vibes ?? [],
  });
  const geo = { displayName: profile.home_location, lat: profile.home_lat, lng: profile.home_lng };
  const settingsKey = JSON.stringify([input.location, input.radiusKm, input.vibes, input.startDate]);
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: StreamMessage) => controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));

      if (!refresh) {
        const { data: cached } = await db.from("home_feed").select("*").eq("user_id", user.id).maybeSingle();
        const fresh = cached && cached.settings_key === settingsKey && Date.now() - Date.parse(cached.generated_at) < FEED_TTL_MS;
        if (fresh) {
          send({ type: "done", events: cached.events as WhatsUpEvent[], cached: true, generatedAt: cached.generated_at });
          controller.close();
          return;
        }
      }

      const limit = rateLimit(clientKey(request, user.id), 6, 60 * 60 * 1000); // 6 rebuilds / hour
      if (!limit.ok) {
        send({ type: "source_error", source: "limit", message: `Too many refreshes — try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` });
        controller.close();
        return;
      }
      const events = await runSources(input, geo, send);
      await db.from("home_feed").upsert({
        user_id: user.id,
        events,
        settings_key: settingsKey,
        generated_at: new Date().toISOString(),
      });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
