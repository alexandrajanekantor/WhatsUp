import { geocode } from "@/lib/geocode";
import { mergeEvents, validateLinks } from "@/lib/merge";
import { searchWithClaude } from "@/lib/sources/claude";
import { searchTicketmaster } from "@/lib/sources/ticketmaster";
import { searchInputSchema, type WhatsUpEvent } from "@/lib/types";

export const maxDuration = 300;

// Streams newline-delimited JSON: one message per source as it resolves, then a final merged list.
export async function POST(request: Request) {
  const parsed = searchInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid search" }, { status: 400 });
  const input = parsed.data;

  const geo = await geocode(input.location);
  if (!geo) return Response.json({ error: "Couldn't find that location" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "geo", geo });

      // Both sources always run concurrently; one failing never blocks the other.
      const tm = searchTicketmaster(input, geo).then(async (events) => {
        send({ type: "source", source: "ticketmaster", events });
        return events;
      });
      const ai = searchWithClaude(input, geo)
        .then(validateLinks)
        .then((events) => {
          send({ type: "source", source: "ai", events });
          return events;
        });

      const [tmRes, aiRes] = await Promise.allSettled([
        tm.catch((e) => { send({ type: "source_error", source: "ticketmaster", message: String(e.message ?? e) }); throw e; }),
        ai.catch((e) => { send({ type: "source_error", source: "ai", message: String(e.message ?? e) }); throw e; }),
      ]);
      const lists: WhatsUpEvent[][] = [
        tmRes.status === "fulfilled" ? tmRes.value : [],
        aiRes.status === "fulfilled" ? aiRes.value : [],
      ];
      send({ type: "done", events: mergeEvents(lists, input) });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
