import type { GeoResult } from "./types";

// Nominatim (OpenStreetMap): no key required; usage policy requires a User-Agent.
export async function geocode(query: string): Promise<GeoResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "WhatsUp/0.1 (event discovery app)" } });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return hit ? { displayName: hit.display_name, lat: Number(hit.lat), lng: Number(hit.lon) } : null;
}
