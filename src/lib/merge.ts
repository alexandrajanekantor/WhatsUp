import { rankEvents } from "./rank";
import type { SearchInput, WhatsUpEvent } from "./types";

const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function dedupeKey(e: WhatsUpEvent) {
  return `${norm(e.title)}|${(e.startAt ?? "").slice(0, 10)}`;
}

// HEAD (fallback GET) check so AI-found links that 404 are dropped. Bot-blocking
// sites (401/403/429) are kept: the page likely exists, we just can't confirm.
async function linkIsLive(url: string): Promise<boolean> {
  const tryFetch = async (method: "HEAD" | "GET") => {
    const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(6000) });
    return res.status;
  };
  try {
    let status = await tryFetch("HEAD");
    if (status === 405 || status === 501) status = await tryFetch("GET");
    return status < 400 || [401, 403, 429].includes(status);
  } catch {
    return false;
  }
}

export async function validateLinks(events: WhatsUpEvent[]): Promise<WhatsUpEvent[]> {
  const checks = await Promise.all(events.map((e) => linkIsLive(e.sourceUrl)));
  return events.filter((_, i) => checks[i]);
}

export function mergeEvents(
  lists: WhatsUpEvent[][],
  input: SearchInput,
  bounds?: { startIso: string; endIso: string },
): WhatsUpEvent[] {
  const seen = new Map<string, WhatsUpEvent>();
  // Earlier lists (structured API data) win over later ones (AI) on duplicates.
  for (const list of lists) {
    for (const e of list) {
      const key = dedupeKey(e);
      const prev = seen.get(key);
      // Keep the first (API data wins), but within sources prefer an event-specific link over a roundup.
      if (!prev || (prev.listingPage && !e.listingPage && prev.source === e.source)) seen.set(key, e);
    }
  }
  const events = [...seen.values()].filter((e) => {
    // Ticketmaster also returns long-running passes/exhibits that started months ago; keep events that start in the window.
    if (bounds && e.startAt && (e.startAt < bounds.startIso || e.startAt > bounds.endIso)) return false;
    if (input.freeOnly && (e.priceMin ?? 0) > 0) return false;
    if (input.maxPrice != null && e.priceMin != null && e.priceMin > input.maxPrice) return false;
    return true;
  });
  return rankEvents(events, input.vibes);
}
