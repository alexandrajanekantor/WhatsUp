"use client";

import { useEffect, useState } from "react";
import EventCard from "./EventCard";
import type { WhatsUpEvent } from "@/lib/types";

export default function FavoritesView() {
  const [events, setEvents] = useState<WhatsUpEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/favorites")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setEvents(((await res.json()) as { events: WhatsUpEvent[] }).events);
      })
      .catch(() => setError("Couldn't load your favorites."));
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Favorites</h1>
      <p className="mt-1 text-stone-600">Events you&apos;ve saved. Tap the heart to remove one.</p>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {!events && !error && <p className="mt-4 text-stone-600">Loading…</p>}
      {events?.length === 0 && <p className="mt-4 text-stone-600">Nothing saved yet. Tap the ♡ on any event to keep it here.</p>}
      <div className="mt-6 space-y-3">{events?.map((ev) => <EventCard key={ev.id} event={ev} />)}</div>
    </div>
  );
}
