import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createAdminClient } from "../supabase/admin";
import { aiEnabled } from "../ai-config";
import type { CrawlCity } from "./city";
import { scanSource } from "./scan";

const candidateSchema = z.array(z.object({ name: z.string(), url: z.string().url() }));

// One cheap AI web search per city that proposes *calendar pages* (not events). Each proposal is then
// probed with the free extractors; only pages that really yield events become active sources.
export async function discoverCandidates(city: CrawlCity): Promise<{ name: string; url: string }[]> {
  if (!aiEnabled()) throw new Error("AI is disabled (DISABLE_AI=1): discovery needs Claude. Use --seed instead.");
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `List up to 30 web pages that publish upcoming public events for ${city.display_name} and nearby: official city/county/parks calendars, tourism board, public libraries, museums, zoos and gardens, performing-arts venues, theaters, music venues, farmers/artisan markets, universities, alt-weekly and local magazine event listings, and community organizations. Prefer each organization's own events or calendar page. Skip Facebook, Eventbrite search pages, and general news. Reply with ONLY a JSON array: [{"name": string, "url": string}].`,
    },
  ];
  let text = "";
  for (let turn = 0; turn < 4; turn++) {
    const res = await client.messages
      .stream({
        model: "claude-haiku-5-5",
        max_tokens: 8000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
        messages,
      })
      .finalMessage();
    text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  const match = /\[\s*\{/.exec(text);
  if (!match) return [];
  try {
    return candidateSchema.parse(JSON.parse(text.slice(match.index, text.lastIndexOf("]") + 1)));
  } catch {
    return [];
  }
}

// If a page itself has no events, its site often has a calendar one click away.
export function pathVariants(url: string): string[] {
  const u = new URL(url);
  return [...new Set([url, `${u.origin}/events`, `${u.origin}/events/`, `${u.origin}/calendar`, `${u.origin}/calendar/`, `${u.origin}/whats-on`])];
}

// Registers candidates as sources and probes each one. Returns counts for reporting.
export async function probeAndStore(city: CrawlCity, candidates: { name: string; url: string }[], by: "seed" | "ai") {
  const db = createAdminClient();
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10);
  const report: { name: string; url: string; kind: string; events: number; status: string }[] = [];

  for (const c of candidates) {
    let best = { url: c.url, kind: "none", count: 0 };
    let undecided = false; // AI fallback was unavailable, so we can't call this source empty
    for (const variant of c.url.includes("?") ? [c.url] : pathVariants(c.url)) {
      const r = await scanSource(variant, { tz: city.timezone, from, to, maxEventPages: 8 });
      if (r.llmUnavailable) undecided = true;
      if (r.events.length > best.count) best = { url: variant, kind: r.kind, count: r.events.length };
      if (best.count >= 3) break;
    }
    const status = best.count > 0 ? "active" : undecided ? "candidate" : "rejected";
    await db.from("sources").upsert(
      { city_key: city.city_key, name: c.name, url: best.url, kind: best.kind, status, discovered_by: by, last_event_count: best.count, last_fetched_at: new Date().toISOString() },
      { onConflict: "city_key,url" },
    );
    report.push({ name: c.name, url: best.url, kind: best.kind, events: best.count, status });
  }
  await db.from("crawl_cities").update({ last_discovered_at: new Date().toISOString() }).eq("city_key", city.city_key);
  return report;
}
