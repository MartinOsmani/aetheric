export const CHANNEL_LABEL: Record<string, string> = {
  ai_chat_sponsored_answer: "AI chat sponsored answer",
  prompt_aware_native: "Prompt-aware native",
  sponsored_autocomplete: "Sponsored autocomplete",
  podcast_readout: "Podcast readout",
  display_retargeting: "Display retargeting",
  organic_search: "Organic search",
};

// Tailwind gradient accents, matched to JourneyView's channel palette.
export const CHANNEL_ACCENT: Record<string, string> = {
  ai_chat_sponsored_answer: "from-indigo-500 to-fuchsia-500",
  prompt_aware_native: "from-cyan-400 to-sky-500",
  sponsored_autocomplete: "from-teal-400 to-emerald-500",
  podcast_readout: "from-amber-400 to-orange-500",
  display_retargeting: "from-pink-500 to-rose-500",
  organic_search: "from-zinc-400 to-zinc-500",
};

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "—";
  return CHANNEL_LABEL[channel] ?? channel;
}

export function channelAccent(channel: string): string {
  return CHANNEL_ACCENT[channel] ?? "from-zinc-400 to-zinc-600";
}
