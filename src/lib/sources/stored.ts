import { distanceKm } from "../crawl/city";
import { fromRow, type EventRow } from "../event-db";
import { createAdminClient } from "../supabase/admin";
import type { GeoResult, SearchInput, WhatsUpEvent } from "../types";

// Events our crawler has already collected for cities near the searched location. Free and instant.
export async function searchStored(input: SearchInput, geo: GeoResult): Promise<WhatsUpEvent[]> {
  const db = createAdminClient();
  const { data: cities, error: cityErr } = await db.from("crawl_cities").select("city_key, lat, lng");
  if (cityErr) throw new Error(cityErr.message);
  const nearby = (cities ?? []).filter((c) => distanceKm(geo.lat, geo.lng, c.lat, c.lng) <= input.radiusKm + 25);
  if (nearby.length === 0) return [];

  const { data, error } = await db
    .from("events")
    .select("*")
    .in("city_key", nearby.map((c) => c.city_key))
    .gte("start_at", `${input.startDate}T00:00:00Z`)
    .lte("start_at", `${input.endDate}T23:59:59Z`)
    .order("start_at")
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data as EventRow[]).map(fromRow);
}
