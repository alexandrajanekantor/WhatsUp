import tzlookup from "tz-lookup";
import { geocode } from "../geocode";
import { createAdminClient } from "../supabase/admin";

export interface CrawlCity {
  city_key: string;
  display_name: string;
  lat: number;
  lng: number;
  timezone: string;
}

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// "Portland, Multnomah County, Oregon, United States" -> "portland-oregon" (name + state/region).
export function cityKey(displayName: string) {
  const parts = displayName.split(",").map((p) => p.trim());
  return slugify(parts.length > 2 ? `${parts[0]} ${parts[parts.length - 2]}` : parts.join(" "));
}

// Geocodes a city name and registers it as a crawl target.
export async function ensureCity(name: string): Promise<CrawlCity> {
  const geo = await geocode(name);
  if (!geo) throw new Error(`Couldn't geocode "${name}"`);
  const city: CrawlCity = {
    city_key: cityKey(geo.displayName),
    display_name: geo.displayName,
    lat: geo.lat,
    lng: geo.lng,
    timezone: tzlookup(geo.lat, geo.lng),
  };
  const { error } = await createAdminClient().from("crawl_cities").upsert(city, { onConflict: "city_key" });
  if (error) throw new Error(error.message);
  return city;
}

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
