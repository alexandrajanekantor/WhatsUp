import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { VIBES } from "../vibes";
import type { GeoResult, SearchInput, WhatsUpEvent } from "../types";

const client = new Anthropic();

const aiEventSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  start: z.string().nullish(), // ISO 8601 with offset if known
  end: z.string().nullish(),
  venue: z.string().nullish(),
  address: z.string().nullish(),
  price_min: z.number().nullish(),
  price_max: z.number().nullish(),
  vibes: z.array(z.string()).default([]),
  source_url: z.string().url(),
  link_type: z.enum(["event", "listing"]).default("listing"),
});

interface Angle {
  vibes: string[];
  focus: string;
}

// Each angle becomes its own concurrent web-search call, so one flaky run can't sink the whole source
// and the combined list is closer to exhaustive than a single call returns.
function planAngles(input: SearchInput): Angle[] {
  const general =
    "Focus on broad community listings: city and county calendars, parks and recreation, libraries, farmers and artisan markets, museums, venue calendars, and neighborhood event roundups.";
  const v = input.vibes;
  if (v.length >= 3) {
    const half = Math.ceil(v.length / 2);
    const niche = "Focus on niche organizers, independent shops, community groups and small venues that fit these vibes.";
    return [
      { vibes: v.slice(0, half), focus: niche },
      { vibes: v.slice(half), focus: niche },
      { vibes: v, focus: general },
    ];
  }
  return [
    { vibes: v, focus: "Focus on niche organizers, independent shops, community groups and small venues that fit these vibes, not just big ticketing sites." },
    { vibes: v, focus: general },
  ];
}

function buildPrompt(input: SearchInput, geo: GeoResult, angle: Angle) {
  const vibeList = VIBES.map((v) => v.id).join(", ");
  const wanted = angle.vibes.length ? angle.vibes.join(", ") : "any vibe";
  return `Find real, specific events and activities happening near ${geo.displayName} (within about ${input.radiusKm} km) between ${input.startDate} and ${input.endDate}.

Vibes the user wants: ${wanted}.
Other preferences: setting=${input.setting}; time of day=${input.timeOfDay}; ${input.freeOnly ? "free only; " : ""}${input.maxPrice != null ? `max price ${input.maxPrice}; ` : ""}${input.accessible ? "must be wheelchair accessible; " : ""}

${angle.focus} Be exhaustive: return every good match you can verify, up to 25. Only include events whose date falls in the range and that you found on a page you can link to. Never invent events or URLs. source_url must be the most specific page for that exact event (the event's own page, a ticketing/registration page, or the organizer's page for it); open pages to find it rather than citing a roundup. Only if no event-specific page exists, use the best calendar or article page that lists it. Set link_type to "event" when source_url is event-specific, otherwise "listing".

Respond with ONLY a JSON array (no prose, no markdown fences). Each item:
{"title": string, "description": string (1-2 sentences), "start": ISO 8601 or null, "end": ISO 8601 or null, "venue": string|null, "address": string|null, "price_min": number|null, "price_max": number|null, "vibes": subset of [${vibeList}], "source_url": string, "link_type": "event"|"listing"}`;
}

// Finds the JSON array of events in the reply. Prose around it may contain stray brackets
// (citations like "[1]"), so start from the first "[" that opens an array of objects.
function extractJson(text: string): unknown[] {
  const match = /\[\s*\{/.exec(text);
  const end = text.lastIndexOf("]");
  if (!match || end <= match.index) return [];
  try {
    const parsed = JSON.parse(text.slice(match.index, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Hard cap per angle (all its turns and the retry): a slow search is dropped instead of stalling the others.
const ANGLE_TIMEOUT_MS = 150_000;

async function runAngle(input: SearchInput, geo: GeoResult, angle: Angle): Promise<unknown[]> {
  const signal = AbortSignal.timeout(ANGLE_TIMEOUT_MS);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(input, geo, angle) }];

  const ask = async () => {
    let text = "";
    // Server-side web search can pause the turn; resume until it completes.
    for (let turn = 0; turn < 4; turn++) {
      const response = await client.messages
        .stream(
          {
            model: "claude-sonnet-5-5",
            max_tokens: 32000,
            tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 12 }],
            messages,
          },
          { signal },
        )
        .finalMessage();
      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (response.stop_reason !== "pause_turn") return { text, content: response.content };
      messages.push({ role: "assistant", content: response.content });
    }
    return { text, content: null };
  };

  const first = await ask();
  let items = extractJson(first.text);
  if (items.length === 0 && first.text.trim() && first.content) {
    // The model answered but not as a clean JSON array: ask once for just the array.
    messages.push({ role: "assistant", content: first.content });
    messages.push({ role: "user", content: "Reply again with ONLY the JSON array described above and nothing else." });
    items = extractJson((await ask()).text);
  }
  return items;
}

export async function searchWithClaude(input: SearchInput, geo: GeoResult): Promise<WhatsUpEvent[]> {
  const angles = planAngles(input);
  const settled = await Promise.allSettled(angles.map((a) => runAngle(input, geo, a)));
  if (settled.every((r) => r.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }

  const out = new Map<string, WhatsUpEvent>();
  settled.forEach((res, i) => {
    const items = res.status === "fulfilled" ? res.value : [];
    console.info(`[claude-search] angle ${i + 1}/${angles.length}: ${res.status === "fulfilled" ? `${items.length} raw items` : `failed (${res.reason})`}`);
    for (const raw of items) {
      const parsed = aiEventSchema.safeParse(raw);
      if (!parsed.success) continue;
      const e = parsed.data;
      const id = hash(e.source_url + e.title);
      if (out.has(id)) continue;
      out.set(id, {
        id: `ai:${id}`,
        source: "ai",
        sourceId: id,
        title: e.title,
        description: e.description ?? null,
        startAt: e.start ?? null,
        endAt: e.end ?? null,
        venue: e.venue ?? null,
        address: e.address ?? null,
        lat: null,
        lng: null,
        priceMin: e.price_min ?? null,
        priceMax: e.price_max ?? null,
        vibes: e.vibes,
        imageUrl: null,
        sourceUrl: e.source_url,
        listingPage: e.link_type === "listing",
      });
    }
  });
  return [...out.values()];
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
