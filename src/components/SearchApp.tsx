"use client";

import { useState } from "react";
import EventCard from "./EventCard";
import { VIBES, type VibeId } from "@/lib/vibes";
import type { WhatsUpEvent } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

type SourceStatus = "pending" | "done" | "error";
type StreamMessage =
  | { type: "geo" }
  | { type: "source"; source: string; events: WhatsUpEvent[] }
  | { type: "source_error"; source: string; message: string }
  | { type: "done"; events: WhatsUpEvent[] };

export default function SearchApp() {
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(plusDays(7));
  const [radiusKm, setRadiusKm] = useState(40);
  const [vibes, setVibes] = useState<VibeId[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [setting, setSetting] = useState("any");
  const [timeOfDay, setTimeOfDay] = useState("any");
  const [accessible, setAccessible] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const [events, setEvents] = useState<WhatsUpEvent[]>([]);
  const [status, setStatus] = useState<Record<string, SourceStatus> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleVibe = (id: VibeId) =>
    setVibes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const quick = (days: number) => {
    setStartDate(today());
    setEndDate(plusDays(days));
  };
  const thisWeekend = () => {
    const now = new Date();
    const toFri = (5 - now.getDay() + 7) % 7;
    const fri = new Date(now.getTime() + (now.getDay() === 0 ? -2 : now.getDay() === 6 ? -1 : toFri) * 864e5);
    setStartDate(fri.toISOString().slice(0, 10));
    setEndDate(new Date(fri.getTime() + 2 * 864e5).toISOString().slice(0, 10));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setEvents([]);
    setStatus({ ticketmaster: "pending", ai: "pending" });

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location, startDate, endDate, radiusKm, vibes, freeOnly,
          maxPrice: maxPrice === "" ? null : Number(maxPrice),
          setting, timeOfDay, accessible,
        }),
      });
      if (!res.ok || !res.body) {
        setError((await res.json().catch(() => null))?.error ?? "Search failed");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) handleMessage(JSON.parse(line));
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleMessage(msg: StreamMessage) {
    if (msg.type === "source") {
      setStatus((s) => ({ ...s, [msg.source]: "done" }));
      // Show early results as each source lands; the final merge replaces them.
      setEvents((prev) => [...prev, ...msg.events]);
    } else if (msg.type === "source_error") {
      setStatus((s) => ({ ...s, [msg.source]: "error" }));
    } else if (msg.type === "done") {
      setEvents(msg.events);
    }
  }

  const label = (s: SourceStatus | undefined) => (s === "pending" ? "searching…" : s === "error" ? "unavailable" : "done");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">WhatsUp</h1>
        <p className="mt-2 text-stone-600">Plan fun into your life, wherever you are.</p>
      </header>

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <label className="text-sm font-medium">
            Where?
            <input
              required value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="City, neighborhood or address"
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            From
            <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium">
            To
            <input type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => quick(0)} className="rounded-full border px-3 py-1 hover:bg-stone-100">Today</button>
          <button type="button" onClick={thisWeekend} className="rounded-full border px-3 py-1 hover:bg-stone-100">This weekend</button>
          <button type="button" onClick={() => quick(7)} className="rounded-full border px-3 py-1 hover:bg-stone-100">Next 7 days</button>
          <button type="button" onClick={() => quick(30)} className="rounded-full border px-3 py-1 hover:bg-stone-100">Next 30 days</button>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">What are you into?</legend>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => (
              <button
                key={v.id} type="button" onClick={() => toggleVibe(v.id)} aria-pressed={vibes.includes(v.id)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  vibes.includes(v.id) ? "border-violet-600 bg-violet-600 text-white" : "border-stone-300 bg-white hover:bg-stone-100"
                }`}
              >
                {v.emoji} {v.label}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="button" onClick={() => setShowMore((s) => !s)} className="text-sm text-violet-700 hover:underline">
          {showMore ? "Hide filters" : "More filters"}
        </button>
        {showMore && (
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Distance: {radiusKm} km
              <input type="range" min={5} max={250} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="mt-2 w-full" />
            </label>
            <label className="text-sm font-medium">
              Max price ($)
              <input type="number" min={0} value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} disabled={freeOnly}
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium">
              Setting
              <select value={setting} onChange={(e) => setSetting(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2">
                <option value="any">Indoor or outdoor</option><option value="indoor">Indoor</option><option value="outdoor">Outdoor</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Time of day
              <select value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2">
                <option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option><option value="night">Late night</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free only
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} /> Wheelchair accessible
            </label>
          </div>
        )}

        <button disabled={loading} className="w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
          {loading ? "Searching…" : "Find things to do"}
        </button>
      </form>

      {status && (
        <p className="mt-4 text-sm text-stone-600">
          Ticketmaster: {label(status.ticketmaster)} · Web search (Claude): {label(status.ai)}
          {loading && " — the web search can take a minute or two."}
        </p>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}

      <section className="mt-6 space-y-3">
        {events.length > 0 && <h2 className="text-lg font-semibold">{events.length} ideas</h2>}
        {events.map((ev) => <EventCard key={ev.id} event={ev} />)}
        {!loading && status && events.length === 0 && !error && (
          <p className="text-stone-600">Nothing found. Try widening the dates, distance or vibes.</p>
        )}
      </section>
    </div>
  );
}
