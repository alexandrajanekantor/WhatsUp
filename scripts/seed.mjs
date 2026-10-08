// Seeds the events cache with a few fixtures through the REST API (service role key) and reads them back.
// Run after the schema exists: `node scripts/seed.mjs`
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env", quiet: true });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const events = [
  { id: "seed:moon-market", source: "seed", source_id: "moon-market", title: "Full Moon Witches' Market", description: "Tarot readings, crystals, herbs and handmade candles.", start_at: "2026-10-24T18:00:00Z", venue: "Example Hall", address: "123 Main St, Portland, OR", vibes: ["witchy", "arts", "seasonal"], source_url: "https://example.com/moon-market" },
  { id: "seed:forest-hike", source: "seed", source_id: "forest-hike", title: "Autumn Color Guided Hike", description: "Easy 4-mile guided loop through fall foliage.", start_at: "2026-10-17T16:00:00Z", venue: "Forest Park", address: "Portland, OR", price_min: 0, vibes: ["outdoorsy", "family"], source_url: "https://example.com/forest-hike" },
  { id: "seed:pumpkin-patch", source: "seed", source_id: "pumpkin-patch", title: "Pumpkin Patch & Corn Maze", description: "Family-friendly harvest festival with hayrides.", start_at: "2026-10-11T17:00:00Z", venue: "Example Farm", address: "Sauvie Island, OR", price_min: 12, price_max: 20, vibes: ["family", "seasonal", "outdoorsy"], source_url: "https://example.com/pumpkin-patch" },
];

const up = await supabase.from("events").upsert(events);
if (up.error) { console.error("seed failed:", up.error.message); process.exit(1); }

const read = await supabase.from("events").select("id,title,vibes").like("id", "seed:%").order("start_at");
if (read.error) { console.error("read failed:", read.error.message); process.exit(1); }
console.table(read.data);

for (const table of ["profiles", "searches", "favorites"]) {
  const r = await supabase.from(table).select("*", { count: "exact", head: true });
  console.log(table, r.error ? `ERROR ${r.error.message}` : `ok (${r.count} rows)`);
}
