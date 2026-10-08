// Polite fetching: identifies itself, honors robots.txt, spaces requests per host, caps size and time.
const UA = "WhatsUpBot/0.1 (+https://github.com/alexandrajanekantor/WhatsUp)";
const HOST_DELAY_MS = 1000;
const MAX_BYTES = 3_000_000;

const lastHit = new Map<string, number>();
interface Rule {
  allow: boolean;
  pattern: RegExp;
  length: number;
}
const robotsCache = new Map<string, Rule[]>(); // origin -> rules for our user agent (or *)

// robots.txt pattern -> regex: "*" matches anything, a trailing "$" anchors the end, otherwise prefix match.
function toRule(allow: boolean, value: string): Rule {
  const anchored = value.endsWith("$");
  const body = (anchored ? value.slice(0, -1) : value).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return { allow, pattern: new RegExp(`^${body}${anchored ? "$" : ""}`), length: value.length };
}

async function rulesFor(origin: string): Promise<Rule[]> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      let current: { agents: string[]; rules: Rule[] } | null = null;
      let lastWasAgent = false;
      for (const raw of (await res.text()).split("\n")) {
        const line = raw.split("#")[0].trim();
        const idx = line.indexOf(":");
        if (idx < 0) continue;
        const k = line.slice(0, idx).trim().toLowerCase();
        const v = line.slice(idx + 1).trim();
        if (k === "user-agent") {
          if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
          current.agents.push(v.toLowerCase());
          lastWasAgent = true;
        } else {
          lastWasAgent = false;
          if (current && v && (k === "allow" || k === "disallow")) current.rules.push(toRule(k === "allow", v));
        }
      }
    }
  } catch {
    // no robots.txt reachable: treat as allowed
  }
  // The group naming us wins; otherwise the "*" group.
  const ours = groups.filter((g) => g.agents.some((a) => a !== "*" && UA.toLowerCase().includes(a)));
  const chosen = (ours.length ? ours : groups.filter((g) => g.agents.includes("*"))).flatMap((g) => g.rules);
  robotsCache.set(origin, chosen);
  return chosen;
}

export async function isAllowed(url: string) {
  const u = new URL(url);
  const path = u.pathname + u.search;
  // Longest matching rule wins; on a tie, Allow beats Disallow.
  const matches = (await rulesFor(u.origin)).filter((r) => r.pattern.test(path));
  if (!matches.length) return true;
  const best = matches.reduce((a, b) => (b.length > a.length || (b.length === a.length && b.allow) ? b : a));
  return best.allow;
}

async function waitForHost(host: string) {
  const slot = Math.max(Date.now(), (lastHit.get(host) ?? 0) + HOST_DELAY_MS);
  lastHit.set(host, slot);
  if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
}

export interface Fetched {
  url: string; // final URL after redirects
  contentType: string;
  text: string;
}

export async function politeFetch(url: string, accept = "text/html,application/xhtml+xml,application/json,text/calendar"): Promise<Fetched | null> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (!(await isAllowed(url))) return null;
    await waitForHost(u.host);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = (await res.text()).slice(0, MAX_BYTES);
    return { url: res.url, contentType: res.headers.get("content-type") ?? "", text };
  } catch {
    return null;
  }
}
