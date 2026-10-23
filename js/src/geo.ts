import tzlookup from "tz-lookup";
import { TimePlaceError } from "./errors.js";

export class Place {
  constructor(
    readonly lat: number,
    readonly lon: number,
    readonly name?: string,
  ) {
    if (!(lat >= -90 && lat <= 90)) throw new TimePlaceError(`latitude out of range: ${lat}`);
    if (!(lon >= -180 && lon <= 180)) throw new TimePlaceError(`longitude out of range: ${lon}`);
  }

  get coords(): string {
    return `${fmtCoord(this.lat)},${fmtCoord(this.lon)}`;
  }

  /** IANA time zone name at these coordinates. */
  timeZone(): string {
    return tzlookup(this.lat, this.lon);
  }
}

export type Geocoder = (query: string) => Place | null | undefined | Promise<Place | null | undefined>;

export function createNominatimGeocoder(options?: NominatimOptions): Geocoder {
  return new NominatimGeocoder(options).geocode;
}

function fmtCoord(value: number): string {
  const text = value.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
  return text === "-0" || text === "" ? "0" : text;
}

export interface NominatimOptions {
  userAgent?: string;
  /** Minimum milliseconds between requests. */
  minIntervalMs?: number;
  timeoutMs?: number;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Nominatim geocoder that identifies itself, caches, and limits to 1 request/s. */
export class NominatimGeocoder {
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly cache = new Map<string, Place | null>();
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequest = -Infinity;

  constructor(options: NominatimOptions = {}) {
    this.userAgent = options.userAgent ?? "timeplace";
    this.minIntervalMs = options.minIntervalMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.baseUrl = options.baseUrl ?? "https://nominatim.openstreetmap.org/search";
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
  }

  /** Resolves to `null` when the place is unknown or the service fails. */
  geocode = (query: string): Promise<Place | null> => {
    const run = this.queue.then(() => this.lookup(query));
    this.queue = run.catch(() => undefined);
    return run;
  };

  private async lookup(query: string): Promise<Place | null> {
    const cached = this.cache.get(query);
    if (cached !== undefined) return cached;
    const wait = this.lastRequest + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      const url = `${this.baseUrl}?${new URLSearchParams({ q: query, format: "jsonv2", limit: "1" })}`;
      const res = await this.fetchFn(url, {
        // Browsers ignore User-Agent; Nominatim then falls back to the Referer.
        headers: { "User-Agent": this.userAgent },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) return null;
      const results = (await res.json()) as { lat: string; lon: string }[];
      const first = results[0];
      const place = first ? new Place(Number(first.lat), Number(first.lon), query) : null;
      this.cache.set(query, place);
      return place;
    } catch {
      return null; // service errors leave the place unresolved and are not cached
    } finally {
      this.lastRequest = Date.now();
    }
  }
}
