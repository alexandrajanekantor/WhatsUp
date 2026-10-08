import { z } from "zod";
import { VIBE_IDS } from "./vibes";

export const searchInputSchema = z.object({
  location: z.string().min(2),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),
  radiusKm: z.number().min(1).max(250).default(40),
  vibes: z.array(z.enum(VIBE_IDS)).default([]),
  freeOnly: z.boolean().default(false),
  maxPrice: z.number().nullable().default(null),
  setting: z.enum(["any", "indoor", "outdoor"]).default("any"),
  timeOfDay: z.enum(["any", "morning", "afternoon", "evening", "night"]).default("any"),
  accessible: z.boolean().default(false),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export type EventSource = "ticketmaster" | "ai";

export interface WhatsUpEvent {
  id: string; // `${source}:${sourceId}`
  source: EventSource;
  sourceId: string;
  title: string;
  description: string | null;
  startAt: string | null; // ISO
  endAt: string | null;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceMin: number | null;
  priceMax: number | null;
  vibes: string[];
  imageUrl: string | null;
  sourceUrl: string;
  /** True when sourceUrl is a roundup/calendar page rather than the specific event page. */
  listingPage?: boolean;
}

export interface GeoResult {
  displayName: string;
  lat: number;
  lng: number;
}
