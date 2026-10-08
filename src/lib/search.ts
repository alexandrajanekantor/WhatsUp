import { mergeEvents, validateLinks } from "./merge";
import { searchWithClaude } from "./sources/claude";
import { searchStored } from "./sources/stored";
import { searchTicketmaster } from "./sources/ticketmaster";
import type { GeoResult, SearchInput, StreamMessage, WhatsUpEvent } from "./types";

// Runs Ticketmaster and the Claude web search concurrently, always. One source failing never blocks
// the other. Emits each source as it resolves and returns the merged, ranked list.
export async function runSources(
  input: SearchInput,
  geo: GeoResult,
  send: (msg: StreamMessage) => void,
): Promise<WhatsUpEvent[]> {
  // Cheap sources always run: Ticketmaster and our crawled calendars. The live AI web search is
  // expensive (it reads whole web pages), so it only runs on request (input.deep). Sources run
  // concurrently and one failing never blocks the others.
  const emit = (source: string) => (events: WhatsUpEvent[]) => {
    send({ type: "source", source, events });
    return events;
  };
  const report = (source: string) => (e: unknown) => {
    console.error(`[search] ${source} failed:`, e instanceof Error ? `${e.name}: ${e.message}` : e);
    send({ type: "source_error", source, message: e instanceof Error ? e.message : String(e) });
    throw e;
  };

  const jobs: Promise<WhatsUpEvent[]>[] = [
    searchTicketmaster(input, geo).then(emit("ticketmaster")).catch(report("ticketmaster")),
    searchStored(input, geo).then(emit("web")).catch(report("web")),
  ];
  if (input.deep) jobs.push(searchWithClaude(input, geo).then(validateLinks).then(emit("ai")).catch(report("ai")));

  const settled = await Promise.allSettled(jobs);
  const lists = settled.map((r) => (r.status === "fulfilled" ? r.value : []));
  // Earlier lists win duplicates: structured API data, then our crawl, then AI.
  const merged = mergeEvents(lists, input);
  send({ type: "done", events: merged });
  return merged;
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const todayPlus = (days: number) => isoDate(new Date(Date.now() + days * 864e5));
