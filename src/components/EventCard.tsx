"use client";

import { useFavorites } from "./FavoritesProvider";
import { VIBES } from "@/lib/vibes";
import type { WhatsUpEvent } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "Date TBD";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Date TBD";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatPrice(e: WhatsUpEvent) {
  if (e.priceMin == null) return null;
  if (e.priceMin === 0 && !e.priceMax) return "Free";
  const range = e.priceMax && e.priceMax !== e.priceMin ? `$${e.priceMin}–$${e.priceMax}` : `$${e.priceMin}`;
  return range;
}

export default function EventCard({ event }: { event: WhatsUpEvent }) {
  const price = formatPrice(event);
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(event.id);
  return (
    <article className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      {event.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.imageUrl} alt="" className="hidden h-28 w-28 shrink-0 rounded-lg object-cover sm:block" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-violet-700">{formatDate(event.startAt)}</p>
          <button
            type="button" onClick={() => toggle(event)} aria-pressed={fav}
            aria-label={fav ? "Remove from favorites" : "Save to favorites"}
            className={`-mt-1 rounded-full p-1 text-xl leading-none ${fav ? "text-rose-600" : "text-stone-400 hover:text-rose-500"}`}
          >
            {fav ? "♥" : "♡"}
          </button>
        </div>
        <h3 className="mt-0.5 text-lg font-semibold leading-snug">{event.title}</h3>
        {(event.venue || event.address) && (
          <p className="text-sm text-stone-600">{[event.venue, event.address].filter(Boolean).join(" · ")}</p>
        )}
        {event.description && <p className="mt-2 line-clamp-2 text-sm text-stone-700">{event.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {event.vibes.map((v) => {
            const vibe = VIBES.find((x) => x.id === v);
            return vibe ? (
              <span key={v} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800">
                {vibe.emoji} {vibe.label}
              </span>
            ) : null;
          })}
          {price && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">{price}</span>}
          {event.source === "ai" && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800" title="Found by Claude via web search">
              ✨ AI-found
            </span>
          )}
          {event.listingPage && (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600" title="Links to a calendar or article that lists this event">
              Listed on a roundup page
            </span>
          )}
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm font-medium text-violet-700 hover:underline"
          >
            View event ↗
          </a>
        </div>
      </div>
    </article>
  );
}
