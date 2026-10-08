"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SearchRow {
  id: string;
  location_text: string;
  radius_km: number | null;
  start_date: string | null;
  end_date: string | null;
  filters: Record<string, unknown> | null;
  created_at: string;
}

// Rebuilds the home-page query string for a saved search so "Run again" prefills and starts it.
function rerunHref(s: SearchRow) {
  const f = s.filters ?? {};
  const p = new URLSearchParams({ location: s.location_text, run: "1" });
  if (s.start_date) p.set("from", s.start_date);
  if (s.end_date) p.set("to", s.end_date);
  if (s.radius_km) p.set("radius", String(s.radius_km));
  const vibes = (f.vibes as string[] | undefined) ?? [];
  if (vibes.length) p.set("vibes", vibes.join(","));
  if (f.freeOnly) p.set("free", "1");
  if (typeof f.maxPrice === "number") p.set("maxPrice", String(f.maxPrice));
  if (f.setting && f.setting !== "any") p.set("setting", String(f.setting));
  if (f.timeOfDay && f.timeOfDay !== "any") p.set("time", String(f.timeOfDay));
  if (f.accessible) p.set("accessible", "1");
  return `/?${p}`;
}

export default function HistoryView() {
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/history")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        setRows(((await res.json()) as { searches: SearchRow[] }).searches);
      })
      .catch(() => setError("Couldn't load your history."));
  }, []);

  async function remove(id?: string) {
    const res = await fetch(`/api/history${id ? `?id=${id}` : ""}`, { method: "DELETE" });
    if (res.ok) setRows((prev) => (id ? (prev ?? []).filter((r) => r.id !== id) : []));
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Search history</h1>
          <p className="mt-1 text-stone-600">Your recent searches. Run one again with a tap.</p>
        </div>
        {rows && rows.length > 0 && (
          <button onClick={() => remove()} className="text-sm text-stone-500 hover:text-red-700 hover:underline">Clear all</button>
        )}
      </div>
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      {!rows && !error && <p className="mt-4 text-stone-600">Loading…</p>}
      {rows?.length === 0 && <p className="mt-4 text-stone-600">No searches yet. <Link href="/" className="text-violet-700 hover:underline">Try one</Link>.</p>}
      <ul className="mt-6 space-y-3">
        {rows?.map((s) => {
          const vibes = ((s.filters?.vibes as string[] | undefined) ?? []).join(", ");
          return (
            <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="min-w-0">
                <p className="font-semibold">{s.location_text}</p>
                <p className="text-sm text-stone-600">
                  {s.start_date} → {s.end_date}{vibes && ` · ${vibes}`}
                </p>
                <p className="text-xs text-stone-400">{new Date(s.created_at).toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-sm">
                <Link href={rerunHref(s)} className="font-medium text-violet-700 hover:underline">Run again</Link>
                <button onClick={() => remove(s.id)} className="text-stone-400 hover:text-red-700" aria-label="Delete search">✕</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
