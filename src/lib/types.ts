import { z } from "zod";
import { VIBE_IDS } from "./vibes";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter dates as YYYY-MM-DD");

export const searchInputSchema = z.object({
  location: z.string().trim().min(2, "Enter a city or address").max(120),
  startDate: isoDay,
  endDate: isoDay,
  radiusKm: z.number().min(1).max(250).default(40),
  vibes: z.array(z.enum(VIBE_IDS)).default([]),
  freeOnly: z.boolean().default(false),
  maxPrice: z.number().nullable().default(null),
  setting: z.enum(["any", "indoor", "outdoor"]).default("any"),
  timeOfDay: z.enum(["any", "morning", "afternoon", "evening", "night"]).default("any"),
  accessible: z.boolean().default(false),
  deep: z.boolean().default(false), // also run the live AI web search (costly); off by default
}).superRefine((v, ctx) => {
  const start = Date.parse(v.startDate);
  const end = Date.parse(v.endDate);
  if (Number.isNaN(start) || Number.isNaN(end)) return;
  if (end < start) ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date must be on or after the start date" });
  else if ((end - start) / 864e5 > 60) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Please pick a range of 60 days or less" });
  if (end < Date.now() - 864e5) ctx.addIssue({ code: "custom", path: ["endDate"], message: "That date range is in the past" });
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export type EventSource = "ticketmaster" | "ai" | "web"; // web = collected by our own crawler

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

export type StreamMessage =
  | { type: "geo"; geo: GeoResult }
  | { type: "source"; source: string; events: WhatsUpEvent[] }
  | { type: "source_error"; source: string; message: string }
  | { type: "done"; events: WhatsUpEvent[]; cached?: boolean; generatedAt?: string };
