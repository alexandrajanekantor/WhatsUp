// Date helpers: pages often give local times with no offset, so interpret them in the city's timezone.
function tzOffsetMs(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

export function localToUtcIso(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let utc = guess - tzOffsetMs(guess, tz);
  utc = guess - tzOffsetMs(utc, tz); // second pass handles DST edges
  return new Date(utc).toISOString();
}

// Accepts ISO-ish strings, with or without offset, and date-only values.
export function parseDate(value: unknown, tz: string): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(v) && /T|\d{1,2}:\d{2}/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return localToUtcIso(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// ICS values: 20261012T180000Z | 20261012T180000 (floating or TZID) | 20261012 (all day)
export function parseIcsDate(value: string, tzid: string | undefined, fallbackTz: string): string | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
  let tz = fallbackTz;
  if (tzid) {
    try {
      Intl.DateTimeFormat("en-US", { timeZone: tzid });
      tz = tzid;
    } catch {
      // unknown TZID (e.g. Outlook names): use the city timezone
    }
  }
  return localToUtcIso(+y, +mo, +d, +h, +mi, +s, tz);
}
