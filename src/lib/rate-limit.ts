// Simple in-memory sliding-window limiter. Searches cost real money (web search + Claude), so cap them.
// Per-process only: it resets on restart and isn't shared across server instances. Swap for a shared
// store (e.g. Redis/Upstash) before running more than one instance.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false as const, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return { ok: true as const };
}

export function clientKey(request: Request, userId?: string | null) {
  if (userId) return `u:${userId}`;
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${fwd || request.headers.get("x-real-ip") || "local"}`;
}

export const tooMany = (retryAfterSec: number) =>
  Response.json(
    { error: `You're searching a lot — please wait ${Math.ceil(retryAfterSec / 60)} min and try again.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
