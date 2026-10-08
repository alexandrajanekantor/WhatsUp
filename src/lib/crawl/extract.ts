import * as cheerio from "cheerio";
import { parseDate, parseIcsDate } from "./dates";
import { politeFetch } from "./fetcher";

// An event as found on a page, before it becomes a WhatsUpEvent.
export interface RawEvent {
  title: string;
  description: string | null;
  start: string; // ISO UTC
  end: string | null;
  venue: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  priceMin: number | null;
  priceMax: number | null;
  imageUrl: string | null;
  url: string;
}

type Json = Record<string, unknown>;
const asArray = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const clean = (s: string | null, max = 600) =>
  s ? cheerio.load(`<div>${s}</div>`)("div").text().replace(/\s+/g, " ").trim().slice(0, max) || null : null;

// ---------- schema.org JSON-LD ----------
function isEventType(t: unknown) {
  return asArray(t as string | string[]).some((x) => typeof x === "string" && /(^|\/)([A-Za-z]*Event|Festival)$/.test(x));
}

function collectEventNodes(node: unknown, out: Json[]) {
  if (Array.isArray(node)) return node.forEach((n) => collectEventNodes(n, out));
  if (!node || typeof node !== "object") return;
  const obj = node as Json;
  if (isEventType(obj["@type"])) out.push(obj);
  for (const key of ["@graph", "itemListElement", "item", "subEvent", "event", "mainEntity"]) collectEventNodes(obj[key], out);
}

function toRaw(node: Json, baseUrl: string, tz: string): RawEvent | null {
  const title = clean(str(node.name), 200);
  const start = parseDate(node.startDate, tz);
  if (!title || !start) return null;
  if (/cancel/i.test(String(node.eventStatus ?? ""))) return null;

  const loc = asArray(node.location as Json | Json[] | string)[0];
  const locObj = typeof loc === "object" ? (loc as Json) : null;
  const addr = locObj?.address;
  const address =
    typeof addr === "string"
      ? addr
      : addr && typeof addr === "object"
        ? [str((addr as Json).streetAddress), str((addr as Json).addressLocality), str((addr as Json).addressRegion)].filter(Boolean).join(", ") || null
        : typeof loc === "string"
          ? null
          : null;
  const geo = locObj?.geo as Json | undefined;

  const offers = asArray(node.offers as Json | Json[]);
  const prices = offers.flatMap((o) => [num(o?.price), num(o?.lowPrice), num(o?.highPrice)]).filter((n): n is number => n != null);

  const img = asArray(node.image as unknown)[0];
  const imageUrl = typeof img === "string" ? img : img && typeof img === "object" ? str((img as Json).url) : null;

  let url = str(node.url) ?? baseUrl;
  try {
    url = new URL(url, baseUrl).href;
  } catch {
    url = baseUrl;
  }
  return {
    title,
    description: clean(str(node.description)),
    start,
    end: parseDate(node.endDate, tz),
    venue: typeof loc === "string" ? str(loc) : str(locObj?.name),
    address,
    lat: num(geo?.latitude),
    lng: num(geo?.longitude),
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    imageUrl,
    url,
  };
}

export function extractJsonLdEvents(html: string, baseUrl: string, tz: string): RawEvent[] {
  const $ = cheerio.load(html);
  const nodes: Json[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      collectEventNodes(JSON.parse(raw), nodes);
    } catch {
      // some sites emit invalid JSON-LD; skip that block
    }
  });
  return nodes.map((n) => toRaw(n, baseUrl, tz)).filter((e): e is RawEvent => e !== null);
}

// ---------- links found on a calendar/listing page ----------
export function extractIcsLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href], link[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !/(\.ics(\?|$)|^webcal:|ical=1|[?&]format=ical|\/ical\b)/i.test(href)) return;
    try {
      links.add(new URL(href.replace(/^webcal:/i, "https:"), baseUrl).href);
    } catch {
      // ignore malformed links
    }
  });
  return [...links].slice(0, 3);
}

export function extractEventLinks(html: string, baseUrl: string, limit: number): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    try {
      const u = new URL($(el).attr("href")!, baseUrl);
      u.hash = "";
      if (u.origin !== base.origin || u.href === base.href) return;
      // detail pages tend to live under /event(s)/<slug> or similar and have more path than the listing itself
      if (/\/(events?|shows?|calendar|whats-on|programs?|tickets)\/[^/]+/i.test(u.pathname) && !/\.(jpg|png|pdf|ics)$/i.test(u.pathname)) {
        links.add(u.href);
      }
    } catch {
      // ignore
    }
  });
  return [...links].slice(0, limit);
}

// ---------- iCalendar ----------
export function parseIcs(text: string, baseUrl: string, tz: string): RawEvent[] {
  const lines = text.replace(/\r/g, "").replace(/\n[ \t]/g, "").split("\n"); // unfold continuation lines
  const events: RawEvent[] = [];
  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      const start = cur.DTSTART && parseIcsDate(cur.DTSTART.value, cur.DTSTART.params.TZID, tz);
      const title = clean(unescapeIcs(cur.SUMMARY?.value ?? ""), 200);
      if (start && title && !/CANCEL/i.test(cur.STATUS?.value ?? "")) {
        const geo = cur.GEO?.value.split(";").map(Number);
        events.push({
          title,
          description: clean(unescapeIcs(cur.DESCRIPTION?.value ?? "")),
          start,
          end: cur.DTEND ? parseIcsDate(cur.DTEND.value, cur.DTEND.params.TZID, tz) : null,
          venue: null,
          address: str(unescapeIcs(cur.LOCATION?.value ?? "")),
          lat: geo?.[0] ?? null,
          lng: geo?.[1] ?? null,
          priceMin: null,
          priceMax: null,
          imageUrl: null,
          url: cur.URL?.value || baseUrl,
        });
      }
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const [name, ...paramParts] = line.slice(0, idx).split(";");
      const params = Object.fromEntries(paramParts.map((p) => p.split("=")).map(([k, v]) => [k.toUpperCase(), (v ?? "").replace(/"/g, "")]));
      cur[name.toUpperCase()] = { value: line.slice(idx + 1), params };
    }
  }
  return events;
}
const unescapeIcs = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

// ---------- platform JSON APIs ----------
// "The Events Calendar" (WordPress) exposes /wp-json/tribe/events/v1/events on thousands of local sites.
export async function fetchTribe(origin: string, from: string, to: string, tz: string): Promise<RawEvent[]> {
  const res = await politeFetch(`${origin}/wp-json/tribe/events/v1/events?per_page=50&start_date=${from}&end_date=${to}`, "application/json");
  if (!res) return [];
  try {
    const data = JSON.parse(res.text) as { events?: Json[] };
    return (data.events ?? []).flatMap((e) => {
      const title = clean(str(e.title));
      const start = parseDate(e.utc_start_date ? `${String(e.utc_start_date).replace(" ", "T")}Z` : e.start_date, tz);
      if (!title || !start) return [];
      const venue = (e.venue ?? {}) as Json;
      const cost = num(e.cost);
      return [{
        title,
        description: clean(str(e.description)),
        start,
        end: parseDate(e.utc_end_date ? `${String(e.utc_end_date).replace(" ", "T")}Z` : e.end_date, tz),
        venue: str(venue.venue),
        address: [str(venue.address), str(venue.city), str(venue.stateprovince)].filter(Boolean).join(", ") || null,
        lat: num(venue.geo_lat),
        lng: num(venue.geo_lng),
        priceMin: cost,
        priceMax: cost,
        imageUrl: e.image && typeof e.image === "object" ? str((e.image as Json).url) : null,
        url: str(e.url) ?? origin,
      }];
    });
  } catch {
    return [];
  }
}

// Localist (common at universities and city sites): /api/2/events
export async function fetchLocalist(origin: string, tz: string): Promise<RawEvent[]> {
  const res = await politeFetch(`${origin}/api/2/events?pp=100&days=21`, "application/json");
  if (!res) return [];
  try {
    const data = JSON.parse(res.text) as { events?: { event: Json }[] };
    return (data.events ?? []).flatMap(({ event: e }) => {
      const inst = asArray((e.event_instances as { event_instance: Json }[] | undefined) ?? []);
      const first = inst[0]?.event_instance;
      const start = parseDate(first?.start ?? e.first_date, tz);
      const title = clean(str(e.title), 200);
      if (!start || !title) return [];
      const geo = (e.geo ?? {}) as Json;
      return [{
        title,
        description: clean(str(e.description_text)),
        start,
        end: parseDate(first?.end, tz),
        venue: str(e.location_name),
        address: str(e.address),
        lat: num(geo.latitude),
        lng: num(geo.longitude),
        priceMin: /free/i.test(String(e.ticket_cost ?? "")) ? 0 : num(e.ticket_cost),
        priceMax: null,
        imageUrl: str(e.photo_url),
        url: str(e.localist_url) ?? origin,
      }];
    });
  } catch {
    return [];
  }
}
