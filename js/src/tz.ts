export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Milliseconds since the epoch for a UTC wall time (avoids Date.UTC's 0-99 year quirk). */
export function utcMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, 0, 0);
  return d.getTime();
}

export function isValidDate(year: number, month: number, day: number): boolean {
  const d = new Date(utcMs(year, month, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function localParts(instant: Date, timeZone: string): LocalParts & { second: number } {
  const v: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== "literal") v[p.type] = Number(p.value);
  }
  return {
    year: v.year!,
    month: v.month!,
    day: v.day!,
    hour: v.hour!,
    minute: v.minute!,
    second: v.second!,
  };
}

function offsetMs(ms: number, timeZone: string): number {
  const p = localParts(new Date(ms), timeZone);
  const local = utcMs(p.year, p.month, p.day, p.hour, p.minute) + p.second * 1000;
  return local - Math.floor(ms / 1000) * 1000;
}

/** Instant for a wall-clock time in `timeZone`; the earlier instant wins when ambiguous. */
export function zonedToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = utcMs(year, month, day, hour, minute);
  const first = offsetMs(guess, timeZone);
  let ms = guess - first;
  const second = offsetMs(ms, timeZone);
  if (second !== first) ms = guess - second;
  return new Date(ms);
}
