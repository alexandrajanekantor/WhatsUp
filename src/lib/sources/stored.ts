import { distanceKm } from "../crawl/city";
import { fromRow, type EventRow } from "../event-db";
import { createAdminClient } from "../supabase/admin";
import { timezoneAt, windowBounds } from "../time";
import type { GeoResult, SearchInput, WhatsUpEvent } from "../types";

// Events our crawler has already collected for cities near the searched location. Free and instant.
export async function searchStored(input: SearchInput, geo: GeoResult): Promise<WhatsUpEvent[]> {
  const db = createAdminClient();
  const { data: cities, error: cityErr } = await db.from("crawl_cities").select("city_key, lat, lng");
  if (cityErr) throw new Error(cityErr.message);
  const nearby = (cities ?? []).filter((c) => distanceKm(geo.lat, geo.lng, c.lat, c.lng) <= input.radiusKm + 25);
  if (nearby.length === 0) return [];

  const { startIso, endIso } = windowBounds(input.startDate, input.endDate, timezoneAt(geo.lat, geo.lng));
  const { data, error } = await db
    .from("events")
    .select("*")
    .in("city_key", nearby.map((c) => c.city_key))
    .gte("start_at", startIso)
    .lte("start_at", endIso)
    .order("start_at")
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data as EventRow[]).map(fromRow);
}
