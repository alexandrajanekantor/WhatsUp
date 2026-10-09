import { createAdminClient } from "../supabase/admin";
import type { CrawlCity } from "./city";
import { scanSource } from "./scan";
import { tagBatch } from "./tagger";

const hashId = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// Crawls every active source for a city, stores the events, then tags vibes for anything untagged.
export async function crawlCity(city: CrawlCity, days = 28) {
  const db = createAdminClient();
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const { data: sources } = await db.from("sources").select("*").eq("city_key", city.city_key).in("status", ["active", "failing", "candidate"]);

  const summary: { source: string; events: number; status: string }[] = [];
  for (const src of sources ?? []) {
    const scan = await scanSource(src.url, { tz: city.timezone, from, to, maxEventPages: 40 });
    const rows = scan.events.map((e) => {
      const sourceId = hashId(`${src.id}|${e.title}|${e.start}`);
      return {
        id: `web:${sourceId}`,
        source: "web",
        source_id: sourceId,
        title: e.title,
        description: e.description,
        start_at: e.start,
        end_at: e.end,
        venue: e.venue,
        address: e.address,
        lat: e.lat,
        lng: e.lng,
        price_min: e.priceMin,
        price_max: e.priceMax,
        image_url: e.imageUrl,
        source_url: e.url,
        listing_page: false,
        city_key: city.city_key,
        timezone: city.timezone,
        crawl_source_id: src.id,
        fetched_at: new Date().toISOString(),
      };
    });
    // Upsert without touching vibes/vibes_tagged so earlier tagging survives re-crawls.
    if (rows.length) await db.from("events").upsert(rows, { onConflict: "id" });

    const failed = rows.length === 0 && !scan.llmUnavailable; // an unavailable AI step isn't the source's fault
    const failCount = failed ? (src.fail_count ?? 0) + 1 : 0;
    const status = failed ? (failCount >= 3 ? "rejected" : "failing") : "active";
    await db.from("sources").update({ last_fetched_at: new Date().toISOString(), last_event_count: rows.length, fail_count: failCount, status, kind: scan.kind !== "none" ? scan.kind : src.kind }).eq("id", src.id);
    summary.push({ source: src.name ?? src.url, events: rows.length, status });
  }

  const tagged = await tagUntagged(city.city_key);
  await db.from("crawl_cities").update({ last_crawled_at: new Date().toISOString() }).eq("city_key", city.city_key);
  return { summary, tagged };
}

// Tags events that have no tags yet, or only keyword tags while Claude tagging is available.
export async function tagUntagged(cityKey: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("events")
    .select("id, title, description, venue, tagged_by")
    .eq("city_key", cityKey)
    .or("vibes_tagged.is.false,vibes_tagged.is.null,tagged_by.eq.keywords")
    .limit(400);
  if (!data?.length) return { claude: 0, keywords: 0 };
  const tags = await tagBatch(data);
  let claude = 0;
  let keywords = 0;
  for (const [id, t] of tags) {
    await db.from("events").update({ vibes: t.vibes, vibes_tagged: true, tagged_by: t.by }).eq("id", id);
    if (t.by === "claude") claude++;
    else keywords++;
  }
  return { claude, keywords };
}
