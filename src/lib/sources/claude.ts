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
});

function buildPrompt(input: SearchInput, geo: GeoResult) {
  const vibeList = VIBES.map((v) => v.id).join(", ");
  const wanted = input.vibes.length ? input.vibes.join(", ") : "any vibe";
  return `Find real, specific events and activities happening near ${geo.displayName} (within about ${input.radiusKm} km) between ${input.startDate} and ${input.endDate}.

Vibes the user wants: ${wanted}.
Other preferences: setting=${input.setting}; time of day=${input.timeOfDay}; ${input.freeOnly ? "free only; " : ""}${input.maxPrice != null ? `max price ${input.maxPrice}; ` : ""}${input.accessible ? "must be wheelchair accessible; " : ""}

Search the web thoroughly, including local calendars, venue sites, community boards, markets, shops, parks departments, and niche organizers, not just big ticketing sites. Be exhaustive: return every good match you can verify, up to 40. Only include events whose date falls in the range and that you found on a page you can link to. Never invent events or URLs; source_url must be the actual page for that event.

Respond with ONLY a JSON array (no prose, no markdown fences). Each item:
{"title": string, "description": string (1-2 sentences), "start": ISO 8601 or null, "end": ISO 8601 or null, "venue": string|null, "address": string|null, "price_min": number|null, "price_max": number|null, "vibes": subset of [${vibeList}], "source_url": string}`;
}

function extractJson(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function searchWithClaude(input: SearchInput, geo: GeoResult): Promise<WhatsUpEvent[]> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: buildPrompt(input, geo) }];
  let finalText = "";

  // Server-side web search can pause the turn; resume until it completes.
  for (let turn = 0; turn < 4; turn++) {
    const stream = client.messages.stream({
      model: "claude-sonnet-5-5",
      max_tokens: 32000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 15 }],
      messages,
    });
    const response = await stream.finalMessage();
    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (response.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: response.content });
  }

  const out: WhatsUpEvent[] = [];
  for (const raw of extractJson(finalText)) {
    const parsed = aiEventSchema.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    out.push({
      id: `ai:${hash(e.source_url + e.title)}`,
      source: "ai",
      sourceId: hash(e.source_url + e.title),
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
    });
  }
  return out;
}

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
