import { z } from "zod";
import { getUser, unauthorized } from "@/lib/auth";
import { fromRow, toRow, type EventRow } from "@/lib/event-db";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsUpEvent } from "@/lib/types";

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.enum(["ticketmaster", "ai", "web"]),
  sourceId: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  description: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  venue: z.string().nullable(),
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  priceMin: z.number().nullable(),
  priceMax: z.number().nullable(),
  vibes: z.array(z.string()),
  imageUrl: z.string().nullable(),
  sourceUrl: z.string().url().refine((u) => /^https?:\/\//.test(u), "http(s) only"),
  listingPage: z.boolean().optional(),
  timezone: z.string().nullable().optional(),
});

// ?ids=1 -> just the favorited event ids (cheap, used to paint hearts); otherwise full events.
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const db = createAdminClient();
  const { data, error } = await db
    .from("favorites")
    .select("event_id, created_at, events(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (new URL(request.url).searchParams.get("ids")) {
    return Response.json({ ids: data.map((r) => r.event_id) });
  }
  const events: WhatsUpEvent[] = data.flatMap((r) => {
    const row = r.events as unknown as EventRow | null;
    return row ? [fromRow(row)] : [];
  });
  return Response.json({ events });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const parsed = eventSchema.safeParse((await request.json().catch(() => null))?.event);
  if (!parsed.success) return Response.json({ error: "Invalid event" }, { status: 400 });
  const event = parsed.data as WhatsUpEvent;

  const db = createAdminClient();
  // Cache the event so the favorite survives after it drops out of search results.
  const up = await db.from("events").upsert(toRow(event));
  if (up.error) return Response.json({ error: up.error.message }, { status: 500 });
  const fav = await db.from("favorites").upsert({ user_id: user.id, event_id: event.id });
  if (fav.error) return Response.json({ error: fav.error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getUser();
  if (!user) return unauthorized();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const { error } = await createAdminClient().from("favorites").delete().eq("user_id", user.id).eq("event_id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
