// Usage: npx tsx scripts/crawl.mts "Portland, OR" [--seed] [--discover] [--no-crawl]
//   --seed      register the built-in seed sources for the city (if any) and probe them
//   --discover  ask Claude (Haiku + web search, ~1 call) to propose calendar pages, then probe them
//   --no-crawl  stop after sources are probed
import "dotenv/config";
import { ensureCity } from "../src/lib/crawl/city.ts";
import { discoverCandidates, probeAndStore } from "../src/lib/crawl/discover.ts";
import { crawlCity } from "../src/lib/crawl/run.ts";
import { SEEDS } from "../src/lib/crawl/seeds.ts";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
if (!name) {
  console.error('Usage: npx tsx scripts/crawl.mts "City, ST" [--seed] [--discover] [--no-crawl]');
  process.exit(1);
}

const city = await ensureCity(name);
console.log(`City: ${city.display_name} (${city.city_key}, ${city.timezone})`);

if (args.includes("--seed")) {
  const seeds = SEEDS[city.city_key] ?? [];
  console.log(`\nProbing ${seeds.length} seed sources…`);
  console.table(await probeAndStore(city, seeds, "seed"));
}
if (args.includes("--discover")) {
  console.log("\nAsking Claude for candidate calendar pages…");
  const candidates = await discoverCandidates(city);
  console.log(`${candidates.length} candidates; probing…`);
  console.table(await probeAndStore(city, candidates, "ai"));
}
if (!args.includes("--no-crawl")) {
  console.log("\nCrawling active sources…");
  const { summary, tagged } = await crawlCity(city);
  console.table(summary);
  console.log("Tagged:", tagged);
}
