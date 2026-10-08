import type { WhatsUpEvent } from "./types";

export const vibeScore = (e: WhatsUpEvent, vibes: readonly string[]) => vibes.filter((v) => e.vibes.includes(v)).length;

// Best vibe match first, then soonest. With no vibes selected this is simply chronological.
export function rankEvents(events: WhatsUpEvent[], vibes: readonly string[]): WhatsUpEvent[] {
  return [...events].sort(
    (a, b) => vibeScore(b, vibes) - vibeScore(a, vibes) || (a.startAt ?? "~").localeCompare(b.startAt ?? "~"),
  );
}
