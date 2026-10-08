import type { GeoResult, SearchInput, WhatsUpEvent } from "../types";
import { tagVibes } from "../vibe-tagger";

interface TmEvent {
  id: string;
  name: string;
  url: string;
  info?: string;
  pleaseNote?: string;
  dates?: { start?: { dateTime?: string; localDate?: string } };
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
  return all.map(toEvent);
}

async function fetchPage(input: SearchInput, geo: GeoResult, key: string, page: number) {
  const params = new URLSearchParams({
    apikey: key,
    latlong: `${geo.lat},${geo.lng}`,
    radius: String(input.radiusKm),
    unit: "km",
    startDateTime: `${input.startDate}T00:00:00Z`,
    endDateTime: `${input.endDate}T23:59:59Z`,
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

function toEvent(e: TmEvent): WhatsUpEvent {
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
    startAt: e.dates?.start?.dateTime ?? (e.dates?.start?.localDate ? `${e.dates.start.localDate}T00:00:00Z` : null),
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
  };
}
