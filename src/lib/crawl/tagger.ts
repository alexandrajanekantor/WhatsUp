import Anthropic from "@anthropic-ai/sdk";
import { aiEnabled } from "../ai-config";
import { VIBES } from "../vibes";
import { tagVibes } from "../vibe-tagger";

const VIBE_IDS: string[] = VIBES.map((v) => v.id);

export interface Taggable {
  id: string;
  title: string;
  description: string | null;
  venue: string | null;
}

// Keyword tags first (free), then one cheap Haiku call per batch of ~40 short records to refine them.
// If Claude is unavailable (no credits, network), the keyword tags stand and the event stays eligible
// for a Claude pass on the next crawl.
export async function tagBatch(events: Taggable[]): Promise<Map<string, { vibes: string[]; by: "claude" | "keywords" }>> {
  const result = new Map<string, { vibes: string[]; by: "claude" | "keywords" }>();
  for (const e of events) result.set(e.id, { vibes: tagVibes(`${e.title} ${e.description ?? ""}`), by: "keywords" });
  if (!aiEnabled()) return result;

  const client = new Anthropic();
  const labels = VIBES.map((v) => `${v.id} (${v.label})`).join(", ");
  for (let i = 0; i < events.length; i += 40) {
    const chunk = events.slice(i, i + 40);
    const list = chunk
      .map((e) => `${e.id} | ${e.title} | ${e.venue ?? ""} | ${(e.description ?? "").slice(0, 160)}`)
      .join("\n");
    try {
      const res = await client.messages.create({
        model: "claude-haiku-5-5",
        max_tokens: 4000,
        output_config: { effort: "low" },
        messages: [
          {
            role: "user",
            content: `Tag each event with the vibes that genuinely fit it (0-4 each), choosing only from: ${labels}.\nBe selective: only tag a vibe if a person who loves that vibe would actually want to go.\n\nEvents (id | title | venue | description):\n${list}\n\nReply with ONLY a JSON object mapping each id to an array of vibe ids.`,
          },
        ],
      });
      const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, unknown>;
      for (const e of chunk) {
        const v = parsed[e.id];
        if (Array.isArray(v)) result.set(e.id, { vibes: v.filter((x): x is string => typeof x === "string" && VIBE_IDS.includes(x)), by: "claude" });
      }
    } catch (err) {
      console.error("[tagger] Claude tagging failed, keeping keyword tags:", err instanceof Error ? err.message.slice(0, 160) : err);
      break; // don't hammer a failing API
    }
  }
  return result;
}
