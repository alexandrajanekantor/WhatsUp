"use client";

import { useMemo, useState } from "react";
import EventCard from "./EventCard";
import { rankEvents, vibeScore } from "@/lib/rank";
import type { WhatsUpEvent } from "@/lib/types";

export type SourceStatus = "pending" | "done" | "error";

const SOURCE_NAMES: Record<string, string> = { ticketmaster: "Ticketmaster", web: "local calendars", ai: "the live web search" };

export function SourceNotices({ status, errors }: { status: Record<string, SourceStatus> | null; errors: Record<string, string> }) {
  if (!status) return null;
  const failed = Object.entries(status).filter(([, s]) => s === "error");
  const pending = Object.entries(status).filter(([, s]) => s === "pending").map(([k]) => SOURCE_NAMES[k] ?? k);
  return (
    <div aria-live="polite" className="mt-4 space-y-2 text-sm">
      {pending.length > 0 && (
        <p className="text-stone-600">
          Still searching {pending.join(" and ")}…
          {pending.includes("the live web search") && " The live web search can take a minute or two; results appear as they arrive."}
        </p>
      )}
      {failed.map(([key]) => (
        <p key={key} className="rounded-lg bg-amber-50 p-3 text-amber-900">
          {key === "limit"
            ? errors[key]
            : `${SOURCE_NAMES[key] ?? key} didn't respond, so some results may be missing. Try searching again in a moment.`}
        </p>
      ))}
    </div>
  );
}

function Skeletons() {
  return (
    <div aria-hidden className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-stone-200 bg-white p-4">
          <div className="h-3 w-24 rounded bg-stone-200" />
          <div className="mt-3 h-5 w-2/3 rounded bg-stone-200" />
          <div className="mt-2 h-3 w-1/2 rounded bg-stone-100" />
          <div className="mt-4 h-3 w-full rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

// Events that match the chosen vibes come first; the rest sit behind a "show more" so a long
// Ticketmaster list doesn't bury the niche finds.
export default function ResultsList({
  events,
  vibes,
  loading,
  searched,
  heading,
}: {
  events: WhatsUpEvent[];
  vibes: readonly string[];
  loading: boolean;
  searched: boolean;
  heading?: (count: number) => string;
}) {
  const [showOthers, setShowOthers] = useState(false);
  const { matches, others } = useMemo(() => {
    const ranked = rankEvents(events, vibes);
    if (vibes.length === 0) return { matches: ranked, others: [] as WhatsUpEvent[] };
    return {
      matches: ranked.filter((e) => vibeScore(e, vibes) > 0),
      others: ranked.filter((e) => vibeScore(e, vibes) === 0),
    };
  }, [events, vibes]);

  if (!searched) return null;
  if (events.length === 0) {
    return loading ? (
      <div className="mt-6">
        <Skeletons />
      </div>
    ) : (
      <div className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-stone-600">
        <p className="font-medium text-stone-800">Nothing turned up for that.</p>
        <p className="mt-1 text-sm">Try widening the dates or distance, or dropping a vibe or two.</p>
      </div>
    );
  }

  const total = events.length;
  return (
    <section className="mt-6 space-y-3">
      <h2 className="text-lg font-semibold">
        {heading ? heading(total) : `${total} ideas`}
        {vibes.length > 0 && others.length > 0 && (
          <span className="ml-2 text-sm font-normal text-stone-500">{matches.length} match your vibes</span>
        )}
      </h2>
      {vibes.length > 0 && matches.length === 0 && !loading && (
        <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-700">
          Nothing matched your vibes exactly, so here&apos;s what&apos;s on nearby.
        </p>
      )}
      {matches.map((ev) => <EventCard key={ev.id} event={ev} />)}
      {others.length > 0 && (
        <>
          <button
            type="button" onClick={() => setShowOthers((s) => !s)}
            className="w-full rounded-xl border border-stone-300 bg-white py-2.5 text-sm font-medium text-violet-700 hover:bg-stone-50"
          >
            {showOthers ? "Hide" : "Show"} {others.length} other event{others.length === 1 ? "" : "s"} nearby that don&apos;t match your vibes
          </button>
          {showOthers && others.map((ev) => <EventCard key={ev.id} event={ev} />)}
        </>
      )}
      {loading && <Skeletons />}
    </section>
  );
}
