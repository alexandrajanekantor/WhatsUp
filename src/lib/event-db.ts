import type { WhatsUpEvent } from "./types";

// Row shape of public.events (snake_case).
export interface EventRow {
  id: string;
  source: string;
  source_id: string;
  title: string;
  description: string | null;
  start_at: string | null;
  end_at: string | null;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price_min: number | null;
  price_max: number | null;
  vibes: string[] | null;
  image_url: string | null;
  source_url: string;
  listing_page?: boolean | null;
}

export const toRow = (e: WhatsUpEvent): EventRow => ({
  id: e.id,
  source: e.source,
  source_id: e.sourceId,
  title: e.title,
  description: e.description,
  start_at: e.startAt,
  end_at: e.endAt,
  venue: e.venue,
  address: e.address,
  lat: e.lat,
  lng: e.lng,
  price_min: e.priceMin,
  price_max: e.priceMax,
  vibes: e.vibes,
  image_url: e.imageUrl,
  source_url: e.sourceUrl,
  listing_page: e.listingPage ?? false,
});

export const fromRow = (r: EventRow): WhatsUpEvent => ({
  id: r.id,
  source: r.source === "ai" ? "ai" : "ticketmaster",
  sourceId: r.source_id,
  title: r.title,
  description: r.description,
  startAt: r.start_at,
  endAt: r.end_at,
  venue: r.venue,
  address: r.address,
  lat: r.lat,
  lng: r.lng,
  priceMin: r.price_min,
  priceMax: r.price_max,
  vibes: r.vibes ?? [],
  imageUrl: r.image_url,
  sourceUrl: r.source_url,
  listingPage: r.listing_page ?? false,
});
