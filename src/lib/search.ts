import { mergeEvents, validateLinks } from "./merge";
import { searchWithClaude } from "./sources/claude";
import { searchTicketmaster } from "./sources/ticketmaster";
import type { GeoResult, SearchInput, StreamMessage, WhatsUpEvent } from "./types";

// Runs Ticketmaster and the Claude web search concurrently, always. One source failing never blocks
// the other. Emits each source as it resolves and returns the merged, ranked list.
export async function runSources(
  input: SearchInput,
  geo: GeoResult,
  send: (msg: StreamMessage) => void,
): Promise<WhatsUpEvent[]> {
  const tm = searchTicketmaster(input, geo).then((events) => {
    send({ type: "source", source: "ticketmaster", events });
    return events;
  });
  const ai = searchWithClaude(input, geo)
    .then(validateLinks)
    .then((events) => {
      send({ type: "source", source: "ai", events });
      return events;
    });

  const report = (source: string) => (e: unknown) => {
    send({ type: "source_error", source, message: e instanceof Error ? e.message : String(e) });
    throw e;
  };
  const [tmRes, aiRes] = await Promise.allSettled([tm.catch(report("ticketmaster")), ai.catch(report("ai"))]);
  const lists: WhatsUpEvent[][] = [
    tmRes.status === "fulfilled" ? tmRes.value : [],
    aiRes.status === "fulfilled" ? aiRes.value : [],
  ];
  const merged = mergeEvents(lists, input);
  send({ type: "done", events: merged });
  return merged;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const todayPlus = (days: number) => isoDate(new Date(Date.now() + days * 864e5));
