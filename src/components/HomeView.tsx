"use client";

import { useEffect, useRef, useState } from "react";
import ResultsList, { SourceNotices, type SourceStatus } from "./ResultsList";
import VibePicker from "./VibePicker";
import { readNdjson } from "@/lib/ndjson";
import type { StreamMessage, WhatsUpEvent } from "@/lib/types";
import type { VibeId } from "@/lib/vibes";

export interface HomeSettings {
  city: string;
  radiusKm: number;
  vibes: VibeId[];
}

export default function HomeView({ initial, name }: { initial: HomeSettings | null; name: string }) {
  const [settings, setSettings] = useState<HomeSettings | null>(initial);
  const [editing, setEditing] = useState(!initial);
  const [form, setForm] = useState<HomeSettings>(initial ?? { city: "", radiusKm: 40, vibes: [] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [events, setEvents] = useState<WhatsUpEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Record<string, SourceStatus> | null>(null);
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ cached: boolean; generatedAt?: string } | null>(null);

  async function loadFeed(refresh = false) {
    setLoading(true);
    setError(null);
    setMeta(null);
    setSourceErrors({});
    setStatus({ ticketmaster: "pending", web: "pending" });
    if (refresh) setEvents([]);
    try {
      const res = await fetch(`/api/home${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Couldn't load your feed");
        return;
      }
      await readNdjson<StreamMessage>(res, (msg) => {
        if (msg.type === "source") {
          setStatus((s) => ({ ...s, [msg.source]: "done" }));
          setEvents((prev) => [...prev, ...msg.events]);
        } else if (msg.type === "source_error") {
          setStatus((s) => ({ ...s, [msg.source]: "error" }));
          setSourceErrors((e) => ({ ...e, [msg.source]: msg.message }));
        } else if (msg.type === "done") {
          setEvents(msg.events);
          setMeta({ cached: Boolean(msg.cached), generatedAt: msg.generatedAt });
          if (msg.cached) setStatus(null);
        }
      });
    } catch {
      setError("Something went wrong loading your feed.");
    } finally {
      setLoading(false);
    }
  }

  const started = useRef(false);
  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      void loadFeed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeLocation: form.city, radiusKm: form.radiusKm, vibes: form.vibes }),
      });
      if (!res.ok) {
        setFormError((await res.json().catch(() => null))?.error ?? "Couldn't save");
        return;
      }
      setSettings(form);
      setEditing(false);
      void loadFeed(true);
    } finally {
      setSaving(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-stone-300 px-3 py-2";
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">
        {settings ? `This week in ${settings.city}` : `Welcome, ${name}`}
      </h1>
      <p className="mt-1 text-stone-600">
        {settings
          ? "Handpicked for your vibes — here without you having to search."
          : "Tell us where you live and what you're into, and we'll line up what's happening each week."}
      </p>

      {editing ? (
        <form onSubmit={save} className="mt-6 space-y-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium">
            Your city
            <input required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}
              placeholder="e.g. Portland, OR" className={input} />
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Your usual vibes</legend>
            <VibePicker value={form.vibes} onChange={(vibes) => setForm({ ...form, vibes })} />
          </fieldset>
          <label className="block text-sm font-medium">
            How far will you go? {form.radiusKm} km
            <input type="range" min={5} max={250} value={form.radiusKm}
              onChange={(e) => setForm({ ...form, radiusKm: Number(e.target.value) })} className="mt-2 w-full" />
          </label>
          {formError && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{formError}</p>}
          <div className="flex gap-3">
            <button disabled={saving} className="rounded-xl bg-violet-600 px-4 py-2.5 font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
              {saving ? "Saving…" : settings ? "Save and refresh my feed" : "Show me what's on"}
            </button>
            {settings && (
              <button type="button" onClick={() => { setForm(settings); setEditing(false); }} className="rounded-xl px-4 py-2.5 text-stone-600 hover:bg-stone-100">
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        settings && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <button onClick={() => setEditing(true)} className="text-violet-700 hover:underline">Edit city &amp; vibes</button>
            <button onClick={() => loadFeed(true)} disabled={loading} className="text-violet-700 hover:underline disabled:opacity-50">
              Refresh
            </button>
            {meta?.cached && meta.generatedAt && (
              <span className="text-stone-500">Updated {new Date(meta.generatedAt).toLocaleString()}</span>
            )}
          </div>
        )
      )}

      <SourceNotices status={loading ? status : status && Object.values(status).includes("error") ? status : null} errors={sourceErrors} />
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
          {error}{" "}
          <button type="button" onClick={() => void loadFeed(true)} className="font-medium underline">Try again</button>
        </p>
      )}

      {settings && !editing && (
        <ResultsList
          events={events} vibes={settings.vibes} loading={loading} searched={!error}
          heading={(n) => `${n} ideas for the next 7 days`}
        />
      )}
    </div>
  );
}
