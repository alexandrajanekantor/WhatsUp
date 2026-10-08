import { z } from "zod";
import { getUser, unauthorized } from "@/lib/auth";
import { geocode } from "@/lib/geocode";
import { createAdminClient } from "@/lib/supabase/admin";
import { VIBE_IDS } from "@/lib/vibes";

export async function GET() {
  const user = await getUser();
  if (!user) return unauthorized();
  const { data } = await createAdminClient()
    .from("profiles")
    .select("display_name, home_location, home_lat, home_lng, default_radius_km, default_vibes")
    .eq("id", user.id)
    .maybeSingle();
  return Response.json({ profile: data });
}

const patchSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  homeLocation: z.string().trim().min(2).max(120).optional(),
  radiusKm: z.number().int().min(1).max(250).optional(),
  vibes: z.array(z.enum(VIBE_IDS)).optional(),
});

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid settings" }, { status: 400 });
  const { displayName, homeLocation, radiusKm, vibes } = parsed.data;

  const update: Record<string, unknown> = {};
  if (displayName !== undefined) update.display_name = displayName;
  if (radiusKm !== undefined) update.default_radius_km = radiusKm;
  if (vibes !== undefined) update.default_vibes = vibes;
  if (homeLocation !== undefined) {
    const geo = await geocode(homeLocation);
    if (!geo) return Response.json({ error: "Couldn't find that city" }, { status: 404 });
    update.home_location = homeLocation;
    update.home_lat = geo.lat;
    update.home_lng = geo.lng;
  }

  // upsert so accounts created before the profile trigger existed still work
  const { error } = await createAdminClient().from("profiles").upsert({ id: user.id, ...update });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
