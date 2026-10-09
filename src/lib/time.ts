import tzlookup from "tz-lookup";
import { localToUtcIso } from "./crawl/dates";

export const timezoneAt = (lat: number, lng: number) => tzlookup(lat, lng);

// A search's "from"/"to" dates are calendar days in the searched place, so convert them to UTC bounds
// using that place's timezone (otherwise evenings near the edges land on the wrong day).
export function windowBounds(startDate: string, endDate: string, tz: string) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  return {
    startIso: localToUtcIso(sy, sm, sd, 0, 0, 0, tz),
    endIso: localToUtcIso(ey, em, ed, 23, 59, 59, tz),
  };
}

// YYYY-MM-DD for "now + days" as the calendar says in the given timezone.
export function todayInTz(tz: string, plusDays = 0) {
  const d = new Date(Date.now() + plusDays * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
