import { TimePlaceError } from "./errors.js";
import { Place, NominatimGeocoder, type Geocoder } from "./geo.js";
import { isValidDate, localParts, utcMs, zonedToInstant } from "./tz.js";

/** A calendar date with no (resolvable) clock time. */
export interface DateOnly {
  kind: "date";
  year: number;
  month: number;
  day: number;
}

/** An instant plus the IANA zone it was written in (`"UTC"` for `z` times). */
export interface ZonedTime {
  kind: "datetime";
  instant: Date;
  timeZone: string;
}

export type Time = DateOnly | ZonedTime;

export interface ParseOptions {
  geocoder?: Geocoder;
  /** Fallback IANA time zone for local clock times when the place is missing or unresolved. */
  tz?: string;
}

const LINE_RE =
  /^\s*(?:(\d{4})-(\d{1,2})-(\d{1,2})(?: (\d{1,2})(?::(\d{2}))?(z|am|pm| am| pm)(?![a-z]))?)?\s*([^#]*)(#[\s\S]*)?$/i;
const NUM = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const COORDS_RE = new RegExp(`^(${NUM})\\s*,\\s*(${NUM})$`);
const TAG_RE = /(?:^|(?<=\s))#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu;

let defaultGeocoder: NominatimGeocoder | undefined;

function getDefaultGeocoder(): Geocoder {
  defaultGeocoder ??= new NominatimGeocoder();
  return defaultGeocoder.geocode;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

export class TimePlace {
  readonly time: Time | null;
  readonly place: Place | null;
  readonly comment: string | null;

  constructor(fields: { time?: Time | null; place?: Place | null; comment?: string | null } = {}) {
    this.time = fields.time ?? null;
    this.place = fields.place ?? null;
    this.comment = fields.comment ?? null;
  }

  /** Lowercased `#word` tags from the comment. */
  get tags(): Set<string> {
    return new Set(
      [...(this.comment ?? "").matchAll(TAG_RE)].map((m) => m[1]!.toLowerCase()),
    );
  }

  with(changes: { time?: Time | null; place?: Place | null; comment?: string | null }): TimePlace {
    return new TimePlace({ ...this, ...changes });
  }

  format(options: { canonical?: boolean } = {}): string {
    return formatTimePlace(this, options);
  }

  toString(): string {
    return this.format();
  }

  static parse(text: string, options?: ParseOptions): Promise<TimePlace> {
    return parse(text, options);
  }

  static parseStrict(text: string): TimePlace {
    return parseStrict(text);
  }
}

interface Scanned {
  year?: string;
  month?: string;
  day?: string;
  hour?: string;
  minute?: string;
  zone?: string;
  placeText: string;
  comment: string | null;
}

function scan(text: string): Scanned {
  const m = LINE_RE.exec(text.replace(/^[\r\n]+|[\r\n]+$/g, ""));
  if (!m) throw new TimePlaceError(`cannot parse: ${JSON.stringify(text)}`); // unreachable: every group is optional
  return {
    year: m[1],
    month: m[2],
    day: m[3],
    hour: m[4],
    minute: m[5],
    zone: m[6]?.trim().toLowerCase(),
    placeText: (m[7] ?? "").trim(),
    comment: m[8] ?? null,
  };
}

function build(s: Scanned, place: Place | null, tz: string | undefined, strict: boolean): TimePlace {
  if (strict) {
    if (place === null) throw new TimePlaceError("strict form requires a place");
    if (s.year !== undefined && s.zone === undefined) {
      throw new TimePlaceError("strict form requires date and clock together");
    }
    if (s.zone !== undefined && s.zone !== "z") {
      throw new TimePlaceError("strict form requires UTC (z) clock time");
    }
  }

  let time: Time | null = null;
  if (s.year !== undefined) {
    const year = Number(s.year);
    const month = Number(s.month);
    const day = Number(s.day);
    if (!isValidDate(year, month, day)) {
      throw new TimePlaceError(`invalid date: ${s.year}-${s.month}-${s.day}`);
    }
    time = { kind: "date", year, month, day };
    if (s.hour !== undefined) {
      let hour = Number(s.hour);
      const minute = Number(s.minute ?? 0);
      if (minute > 59) throw new TimePlaceError(`invalid minute: ${minute}`);
      if (s.zone === "z") {
        if (hour > 23) throw new TimePlaceError(`invalid hour: ${hour}`);
        time = { kind: "datetime", instant: new Date(utcMs(year, month, day, hour, minute)), timeZone: "UTC" };
      } else {
        if (hour < 1 || hour > 12) {
          throw new TimePlaceError(`invalid 12-hour clock hour: ${hour}`);
        }
        hour = (hour % 12) + (s.zone === "pm" ? 12 : 0);
        const timeZone = place?.timeZone() ?? tz;
        if (timeZone !== undefined) {
          time = {
            kind: "datetime",
            instant: zonedToInstant(year, month, day, hour, minute, timeZone),
            timeZone,
          };
        }
      }
    }
  }
  return new TimePlace({ time, place, comment: s.comment });
}

/**
 * Parse a timeplace line.
 *
 * Names are geocoded with `geocoder` (Nominatim by default); failures leave the place
 * unresolved. Local clock times use the place's time zone, else `tz`.
 */
export async function parse(text: string, options: ParseOptions = {}): Promise<TimePlace> {
  const s = scan(text);
  let place: Place | null = null;
  if (s.placeText) {
    const c = COORDS_RE.exec(s.placeText);
    place = c
      ? new Place(Number(c[1]), Number(c[2]))
      : ((await (options.geocoder ?? getDefaultGeocoder())(s.placeText)) ?? null);
  }
  return build(s, place, options.tz, false);
}

/** Synchronous parse of the strict form `[date clock(z)] lat,lon [comment]`; never geocodes. */
export function parseStrict(text: string): TimePlace {
  const s = scan(text);
  let place: Place | null = null;
  if (s.placeText) {
    const c = COORDS_RE.exec(s.placeText);
    if (!c) throw new TimePlaceError(`strict form requires lat,lon place: ${JSON.stringify(s.placeText)}`);
    place = new Place(Number(c[1]), Number(c[2]));
  }
  return build(s, place, undefined, true);
}

export function formatTimePlace(tp: TimePlace, options: { canonical?: boolean } = {}): string {
  const canonical = options.canonical ?? false;
  const parts: string[] = [];
  const t = tp.time;
  if (t?.kind === "datetime") {
    const zone = canonical ? "UTC" : t.timeZone;
    const l = localParts(t.instant, zone);
    const minutes = l.minute ? `:${pad2(l.minute)}` : "";
    const clock =
      zone === "UTC"
        ? `${pad2(l.hour)}${minutes}z`
        : `${((l.hour + 11) % 12) + 1}${minutes}${l.hour >= 12 ? "pm" : "am"}`;
    parts.push(`${String(l.year).padStart(4, "0")}-${pad2(l.month)}-${pad2(l.day)} ${clock}`);
  } else if (t?.kind === "date") {
    parts.push(`${String(t.year).padStart(4, "0")}-${pad2(t.month)}-${pad2(t.day)}`);
  }
  if (tp.place !== null) {
    parts.push(canonical || tp.place.name === undefined ? tp.place.coords : tp.place.name.replaceAll("#", "_"));
  }
  if (tp.comment !== null) parts.push(tp.comment);
  return parts.join(" ");
}
