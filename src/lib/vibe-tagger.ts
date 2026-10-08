import type { VibeId } from "./vibes";

const KEYWORDS: Record<VibeId, RegExp> = {
  family: /\b(family|kids?|children|all ages|puppet|storytime)\b/i,
  outdoorsy: /\b(hike|hiking|trail|park|garden|kayak|camp|outdoor|nature|farm|festival grounds)\b/i,
  witchy: /\b(witch|tarot|astrolog|moon|crystal|occult|pagan|psychic|seance|spell|ritual|oracle|goth)\b/i,
  nightlife: /\b(nightclub|dj|club night|dance party|late night|bar crawl|drag)\b/i,
  arts: /\b(art|gallery|museum|theat(er|re)|ballet|opera|exhibit|symphony|film|poetry)\b/i,
  music: /\b(concert|live music|band|tour|album|jazz|orchestra)\b/i,
  food: /\b(food|wine|beer|tasting|brunch|dinner|market|culinary|cocktail|brew)\b/i,
  wellness: /\b(yoga|meditat|sound bath|wellness|retreat|breathwork|spa)\b/i,
  nerdy: /\b(comic|anime|trivia|board game|d&d|tabletop|sci-?fi|cosplay|convention|gaming)\b/i,
  sporty: /\b(game|match|race|marathon|tournament|nba|nfl|mlb|nhl|soccer|football|basketball)\b/i,
  romantic: /\b(date night|romantic|couples|candlelit|valentine)\b/i,
  seasonal: /\b(halloween|christmas|holiday|harvest|pumpkin|lantern|nutcracker|thanksgiving|new year|spooky)\b/i,
};

const SEGMENT: Record<string, VibeId[]> = {
  music: ["music"],
  sports: ["sporty"],
  "arts & theatre": ["arts"],
};

export function tagVibes(text: string, segment?: string, genre?: string): VibeId[] {
  const out = new Set<VibeId>();
  (SEGMENT[(segment ?? "").toLowerCase()] ?? []).forEach((v) => out.add(v));
  if ((genre ?? "").toLowerCase() === "family") out.add("family");
  for (const [vibe, re] of Object.entries(KEYWORDS) as [VibeId, RegExp][]) {
    if (re.test(text)) out.add(vibe);
  }
  return [...out];
}
