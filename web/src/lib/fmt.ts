export const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

export const MINUTE_MS = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export const shift = (d: Date, ms: number): Date => new Date(d.getTime() + ms);
export const floorHour = (d: Date): Date => new Date(Math.floor(d.getTime() / HOUR) * HOUR);

/** `YYYYMMDD` in UTC. */
export const ymd = (d: Date): string => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

/** `YYYY-MM-DD` in UTC. */
export const isoDate = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** `YYYYMMDDHHMM` in UTC. */
export const stamp = (d: Date): string => `${ymd(d)}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;

export const yymmdd = (d: Date): string => ymd(d).slice(2);

export function minuteOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  minute: number;
}

/** Wall-clock date and minute-of-day of an instant in `timeZone`. */
export function zonedParts(d: Date, timeZone: string): ZonedParts {
  const p: Record<string, number> = {};
  for (const x of new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(d)) {
    if (x.type !== "literal") p[x.type] = Number(x.value);
  }
  return { year: p.year!, month: p.month!, day: p.day!, minute: p.hour! * 60 + p.minute! };
}

const wallMs = (p: ZonedParts) => Date.UTC(p.year, p.month - 1, p.day, 0, p.minute);

export function fromZoned(p: ZonedParts, timeZone: string): Date {
  const wall = wallMs(p);
  const offsetAt = (ms: number) => wallMs(zonedParts(new Date(ms), timeZone)) - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
  return new Date(wall - offsetAt(wall - offsetAt(wall)));
}

export const zonedIsoDate = (p: ZonedParts): string => `${p.year}-${pad(p.month)}-${pad(p.day)}`;

export function clockLabel(d: Date, timeZone: string): string {
  if (timeZone === "UTC") return utcClock(d);
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
}

export function utcClock(d: Date): string {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}z`;
}

export function localLabel(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/** `MM-DD-YYYY` of the calendar date in `timeZone`. */
export function localMdy(d: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.month}-${parts.day}-${parts.year}`;
}
