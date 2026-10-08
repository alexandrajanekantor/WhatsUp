"use client";

import { VIBES, type VibeId } from "@/lib/vibes";

export default function VibePicker({ value, onChange }: { value: VibeId[]; onChange: (v: VibeId[]) => void }) {
  const toggle = (id: VibeId) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2">
      {VIBES.map((v) => (
        <button
          key={v.id} type="button" onClick={() => toggle(v.id)} aria-pressed={value.includes(v.id)}
          className={`rounded-full border px-3 py-1.5 text-sm transition ${
            value.includes(v.id) ? "border-violet-600 bg-violet-600 text-white" : "border-stone-300 bg-white hover:bg-stone-100"
          }`}
        >
          {v.emoji} {v.label}
        </button>
      ))}
    </div>
  );
}
