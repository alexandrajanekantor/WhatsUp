// Master switch for every Claude call (live "dig deeper" search, crawler page reading, vibe tagging,
// source discovery). Set DISABLE_AI=1 in .env to run on Ticketmaster + our own crawled calendars only.
export const aiEnabled = () => process.env.DISABLE_AI !== "1" && Boolean(process.env.ANTHROPIC_API_KEY);
