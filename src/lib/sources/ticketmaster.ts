import type { GeoResult, SearchInput, WhatsUpEvent } from "../types";
import { tagVibes } from "../vibe-tagger";
import { parseDate } from "../crawl/dates";
import { timezoneAt, windowBounds } from "../time";

interface TmEvent {
  id: string;
  name: string;
  url: string;
  info?: string;
  pleaseNote?: string;
  dates?: { timezone?: string; start?: { dateTime?: string; localDate?: string; localTime?: string } };
  images?: { url: string; width: number }[];
  priceRanges?: { min?: number; max?: number }[];
  classifications?: { segment?: { name: string }; genre?: { name: string } }[];
  _embedded?: {
    venues?: {
      name?: string;
      address?: { line1?: string };
      city?: { name?: string };
      state?: { stateCode?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
  };
}

export async function searchTicketmaster(input: SearchInput, geo: GeoResult): Promise<WhatsUpEvent[]> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) throw new Error("TICKETMASTER_API_KEY not set");

  const MAX_PAGES = 5; // Discovery API caps deep paging at ~1000 results (size * page < 1000)
  const all: TmEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchPage(input, geo, key, page);
    all.push(...batch.events);
    if (page + 1 >= batch.totalPages) break;
  }
  return all.map((e) => toEvent(e, timezoneAt(geo.lat, geo.lng)));
}

async function fetchPage(input: SearchInput, geo: GeoResult, key: string, page: number) {
  const { startIso, endIso } = windowBounds(input.startDate, input.endDate, timezoneAt(geo.lat, geo.lng));
  const params = new URLSearchParams({
    apikey: key,
    latlong: `${geo.lat},${geo.lng}`,
    radius: String(input.radiusKm),
    unit: "km",
    startDateTime: startIso.replace(/\.\d{3}Z$/, "Z"),
    endDateTime: endIso.replace(/\.\d{3}Z$/, "Z"),
    size: "100",
    page: String(page),
    sort: "date,asc",
  });
  const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);
  if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
  const data = await res.json();
  return {
    events: (data?._embedded?.events ?? []) as TmEvent[],
    totalPages: (data?.page?.totalPages ?? 1) as number,
  };
}

function toEvent(e: TmEvent, fallbackTz: string): WhatsUpEvent {
  const tz = e.dates?.timezone ?? fallbackTz;
  const start = e.dates?.start;
  const venue = e._embedded?.venues?.[0];
  const cls = e.classifications?.[0];
  const price = e.priceRanges?.[0];
  const image = [...(e.images ?? [])].sort((a, b) => b.width - a.width)[0];
  const description = e.info ?? e.pleaseNote ?? null;
  return {
    id: `ticketmaster:${e.id}`,
    source: "ticketmaster",
    sourceId: e.id,
    title: e.name,
    description,
    // Prefer the exact instant; otherwise read the local date (+time) in the event's own timezone.
  startAt: start?.dateTime ?? (start?.localDate ? parseDate(`${start.localDate}T${start.localTime ?? "00:00:00"}`, tz) : null),
    endAt: null,
    venue: venue?.name ?? null,
    address: [venue?.address?.line1, venue?.city?.name, venue?.state?.stateCode].filter(Boolean).join(", ") || null,
    lat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
    lng: venue?.location?.longitude ? Number(venue.location.longitude) : null,
    priceMin: price?.min ?? null,
    priceMax: price?.max ?? null,
    vibes: tagVibes(`${e.name} ${description ?? ""}`, cls?.segment?.name, cls?.genre?.name),
    imageUrl: image?.url ?? null,
    sourceUrl: e.url,
    timezone: tz,
  };
}
