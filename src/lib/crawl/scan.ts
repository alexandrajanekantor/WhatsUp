import { extractEventLinks, extractIcsLinks, extractJsonLdEvents, fetchLocalist, fetchTribe, parseIcs, type RawEvent } from "./extract";
import { aiEnabled } from "../ai-config";
import { politeFetch } from "./fetcher";
import { extractWithClaude, LlmUnavailable } from "./llm-extract";

export interface ScanOptions {
  tz: string;
  from: string; // YYYY-MM-DD
  to: string;
  maxEventPages: number; // detail pages to follow when the listing page has no structured data
  llm?: boolean; // allow the cheap Haiku fallback that reads the page text (default true)
}

export interface ScanResult {
  /** True when the AI fallback was needed but couldn't run, so "0 events" doesn't mean the source is empty. */
  llmUnavailable?: boolean;
  kind: string; // which extraction methods produced events: jsonld | ics | tribe | localist (joined with +)
  events: RawEvent[];
}

// Tries every free extraction method on a URL, in order of reliability, and returns what it found.
// Used both to probe candidate sources (small maxEventPages) and for the real crawl.
export async function scanSource(url: string, opts: ScanOptions): Promise<ScanResult> {
  const found: { method: string; events: RawEvent[] }[] = [];
  const add = (method: string, events: RawEvent[]) => events.length && found.push({ method, events });

  let llmUnavailable = false;
  const page = await politeFetch(url);
  if (!page) return { kind: "unreachable", events: [] };
  const origin = new URL(page.url).origin;

  if (/text\/calendar/i.test(page.contentType) || /^BEGIN:VCALENDAR/.test(page.text)) {
    add("ics", parseIcs(page.text, page.url, opts.tz));
  } else {
    const html = page.text;
    add("jsonld", extractJsonLdEvents(html, page.url, opts.tz));

    for (const link of extractIcsLinks(html, page.url)) {
      const ics = await politeFetch(link, "text/calendar,*/*");
      if (ics) add("ics", parseIcs(ics.text, link, opts.tz));
    }
    if (/tribe-events|the-events-calendar|wp-content/i.test(html)) add("tribe", await fetchTribe(origin, opts.from, opts.to, opts.tz));
    if (/localist/i.test(html) || new URL(page.url).host.startsWith("events.")) add("localist", await fetchLocalist(origin, opts.tz));

    // Listing pages often only link to event pages, which carry the structured data.
    if (found.reduce((n, f) => n + f.events.length, 0) < 3 && opts.maxEventPages > 0) {
      const detail: RawEvent[] = [];
      for (const link of extractEventLinks(html, page.url, opts.maxEventPages)) {
        const p = await politeFetch(link);
        if (p) detail.push(...extractJsonLdEvents(p.text, p.url, opts.tz));
      }
      add("jsonld-detail", detail);
    }

    // Last resort for plain HTML listings: have a cheap model read the page text.
    if (found.reduce((n, f) => n + f.events.length, 0) < 3 && opts.llm !== false) {
      try {
        add("llm", await extractWithClaude(html, page.url, opts.tz, opts.from, opts.to));
      } catch (e) {
        if (!(e instanceof LlmUnavailable)) throw e;
        llmUnavailable = true;
        if (aiEnabled()) console.warn(`[scan] AI extraction unavailable for ${url}: ${e.message}`);
      }
    }
  }

  // Keep upcoming events inside the window; dedupe by title + start.
  const lo = Date.parse(`${opts.from}T00:00:00Z`) - 864e5;
  const hi = Date.parse(`${opts.to}T23:59:59Z`) + 864e5;
  const seen = new Set<string>();
  const events: RawEvent[] = [];
  for (const { events: list } of found) {
    for (const e of list) {
      const t = Date.parse(e.start);
      const key = `${e.title.toLowerCase()}|${e.start}`;
      if (t < lo || t > hi || seen.has(key)) continue;
      seen.add(key);
      events.push(e);
    }
  }
  return { kind: [...new Set(found.filter((f) => f.events.length).map((f) => f.method))].join("+") || "none", events, llmUnavailable };
}
