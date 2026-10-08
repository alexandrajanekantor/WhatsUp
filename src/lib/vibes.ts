export const VIBES = [
  { id: "family", label: "Family friendly", emoji: "👨‍👩‍👧" },
  { id: "outdoorsy", label: "Outdoorsy", emoji: "🥾" },
  { id: "witchy", label: "Witchy vibes", emoji: "🔮" },
  { id: "nightlife", label: "Nightlife", emoji: "🪩" },
  { id: "arts", label: "Arts & culture", emoji: "🎨" },
  { id: "music", label: "Live music", emoji: "🎸" },
  { id: "food", label: "Food & drink", emoji: "🍷" },
  { id: "wellness", label: "Wellness", emoji: "🧘" },
  { id: "nerdy", label: "Nerdy", emoji: "🎲" },
  { id: "sporty", label: "Sporty", emoji: "🏟️" },
  { id: "romantic", label: "Date night", emoji: "💘" },
  { id: "seasonal", label: "Seasonal & holiday", emoji: "🎃" },
] as const;

export type VibeId = (typeof VIBES)[number]["id"];
export const VIBE_IDS = VIBES.map((v) => v.id) as [VibeId, ...VibeId[]];
