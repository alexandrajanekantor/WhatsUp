"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ResultsList, { SourceNotices, type SourceStatus } from "./ResultsList";
import VibePicker from "./VibePicker";
import { readNdjson } from "@/lib/ndjson";
import { VIBE_IDS, type VibeId } from "@/lib/vibes";
import type { StreamMessage, WhatsUpEvent } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);


// In dev the location starts as the test city so the form is ready to go.
const DEFAULT_TEST_CITY = process.env.NODE_ENV !== "production" ? "Manhattan, New York" : "";

export default function SearchApp({ aiEnabled }: { aiEnabled: boolean }) {
  // History's "Run again" links here with the search in the query string (?run=1 starts it right away).
  const params = useSearchParams();
  const [location, setLocation] = useState(params.get("location") ?? DEFAULT_TEST_CITY);
  const [startDate, setStartDate] = useState(params.get("from") ?? today());
  const [endDate, setEndDate] = useState(params.get("to") ?? plusDays(7));
  const [radiusKm, setRadiusKm] = useState(Number(params.get("radius")) || 40);
  const [vibes, setVibes] = useState<VibeId[]>(
    (params.get("vibes") ?? "").split(",").filter((v): v is VibeId => (VIBE_IDS as string[]).includes(v)),
  );
  const [freeOnly, setFreeOnly] = useState(params.get("free") === "1");
  const [maxPrice, setMaxPrice] = useState<string>(params.get("maxPrice") ?? "");
  const [setting, setSetting] = useState(params.get("setting") ?? "any");
  const [timeOfDay, setTimeOfDay] = useState(params.get("time") ?? "any");
  const [accessible, setAccessible] = useState(params.get("accessible") === "1");
  const [showMore, setShowMore] = useState(Boolean(params.get("free") || params.get("maxPrice") || params.get("setting") || params.get("time") || params.get("accessible")));

  const [searchedVibes, setSearchedVibes] = useState<VibeId[]>([]);
  const [events, setEvents] = useState<WhatsUpEvent[]>([]);
  const [status, setStatus] = useState<Record<string, SourceStatus> | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function runSearch(deep = false) {
    setLoading(true);
    setError(null);
    setEvents([]);
    setSourceErrors({});
    setSearchedVibes(vibes);
    setStatus({ ticketmaster: "pending", web: "pending", ...(deep ? { ai: "pending" as const } : {}) });
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location, startDate, endDate, radiusKm, vibes, freeOnly,
          maxPrice: maxPrice === "" ? null : Number(maxPrice),
          setting, timeOfDay, accessible, deep,
        }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Search failed");
        return;
      }
      await readNdjson<StreamMessage>(res, handleMessage);
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
      setSourceErrors((e) => ({ ...e, [msg.source]: msg.message }));
    } else if (msg.type === "done") {
      setEvents(msg.events);
    }
  }

  const autoRan = useRef(false);
  useEffect(() => {
    if (params.get("run") === "1" && location && !autoRan.current) {
      autoRan.current = true;
      void runSearch(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">WhatsUp</h1>
        <p className="mt-2 text-stone-600">Plan fun into your life, wherever you are.</p>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); void runSearch(false); }} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
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
          <VibePicker value={vibes} onChange={setVibes} />
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

      <SourceNotices status={status} errors={sourceErrors} />
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
          {error}{" "}
          <button type="button" onClick={() => void runSearch(false)} className="font-medium underline">Try again</button>
        </p>
      )}

      <ResultsList events={events} vibes={searchedVibes} loading={loading} searched={status !== null && !error} />

      {aiEnabled && status && !loading && !error && !("ai" in status) && (
        <div className="mt-6 rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4 text-center">
          <p className="text-sm text-violet-900">Want more? Dig deeper has Claude search the live web for niche events our calendars miss.</p>
          <button type="button" onClick={() => void runSearch(true)} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            Dig deeper with AI web search
          </button>
          <p className="mt-2 text-xs text-violet-700">Takes a minute or two and is limited to a few per 10 minutes.</p>
        </div>
      )}
    </div>
  );
}
