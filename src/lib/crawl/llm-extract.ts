import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import { aiEnabled } from "../ai-config";
import { parseDate } from "./dates";
import type { RawEvent } from "./extract";

const MAX_CHARS = 48_000; // ~12k tokens: a full listing page is ~$0.001-0.002 on Haiku

// Reduces a page to readable text, keeping link targets so each event can be linked to its own page.
export function pageToText(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, header nav, footer, form, [aria-hidden=true]").remove();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    try {
      if (href && !href.startsWith("#") && !/^(mailto|tel|javascript):/i.test(href)) {
        $(el).append(` [${new URL(href, baseUrl).href}]`);
      }
    } catch {
      // ignore malformed hrefs
    }
  });
  $("br, p, li, div, h1, h2, h3, h4, tr").each((_, el) => {
    $(el).append("\n");
  });
  return $("body").text().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, MAX_CHARS);
}

interface LlmEvent {
  title?: string;
  start?: string;
  end?: string | null;
  venue?: string | null;
  address?: string | null;
  price?: number | null;
  description?: string | null;
  url?: string | null;
}

export class LlmUnavailable extends Error {}

// Extracts events from a listing page's text. Throws LlmUnavailable when the API can't be used
// (no key, no credits, outage) so callers don't mistake that for "this source has no events".
export async function extractWithClaude(html: string, pageUrl: string, tz: string, from: string, to: string): Promise<RawEvent[]> {
  if (!aiEnabled()) throw new LlmUnavailable("AI disabled (DISABLE_AI=1 or no ANTHROPIC_API_KEY)");
  const text = pageToText(html, pageUrl);
  if (text.length < 200) return [];

  let reply = "";
  try {
    const res = await new Anthropic().messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 8000,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `This is the text of an event listing page (${pageUrl}). Today is ${from}. Extract every distinct upcoming event or recurring program with a specific date between ${from} and ${to}. Skip navigation, ads, past events, and things with no date. Dates have no year? Use the nearest upcoming one.\n\nReply with ONLY a JSON array; each item: {"title": string, "start": "YYYY-MM-DDTHH:MM" local time (or YYYY-MM-DD if no time), "end": same format or null, "venue": string|null, "address": string|null, "price": number|null (0 if free), "description": string|null (one sentence), "url": the event's own page from the bracketed link next to it, or null}\n\n---\n${text}`,
        },
      ],
    });
    reply = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  } catch (e) {
    throw new LlmUnavailable(e instanceof Error ? e.message.slice(0, 200) : String(e));
  }

  const start = /\[\s*\{/.exec(reply);
  if (!start) return [];
  let items: LlmEvent[];
  try {
    items = JSON.parse(reply.slice(start.index, reply.lastIndexOf("]") + 1));
  } catch {
    return [];
  }
  return items.flatMap((e) => {
    const s = parseDate(e.start, tz);
    if (!e.title || !s) return [];
    let url = pageUrl;
    try {
      if (e.url) url = new URL(e.url, pageUrl).href;
    } catch {
      // keep the listing page
    }
    return [{
      title: e.title.slice(0, 200),
      description: e.description ?? null,
      start: s,
      end: parseDate(e.end, tz),
      venue: e.venue ?? null,
      address: e.address ?? null,
      lat: null,
      lng: null,
      priceMin: typeof e.price === "number" ? e.price : null,
      priceMax: typeof e.price === "number" ? e.price : null,
      imageUrl: null,
      url,
    }];
  });
}
