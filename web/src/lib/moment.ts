import { Place, TimePlace, type Time } from "timeplace";
import { floorHour } from "./fmt";

const DEFAULT_ASSUMED_UTC_HOUR = 18;

export interface Moment {
  instant: Date;
  /** Why the instant was assumed, when the line does not fully specify it. */
  note?: string;
}

export function momentOf(time: Time | null, now = new Date()): Moment {
  if (time?.kind === "datetime") return { instant: time.instant };
  if (time?.kind === "date") {
    return {
      instant: new Date(Date.UTC(time.year, time.month - 1, time.day, DEFAULT_ASSUMED_UTC_HOUR)),
      note: `date only; assuming ${DEFAULT_ASSUMED_UTC_HOUR}z`,
    };
  }
  return { instant: floorHour(now), note: "no time; showing now" };
}

export function zoneOf(tp: TimePlace): string | null {
  if (tp.time?.kind === "datetime") return tp.time.timeZone;
  return tp.place?.timeZone() ?? null;
}

export function withInstant(tp: TimePlace, instant: Date): TimePlace {
  const timeZone = tp.time?.kind === "datetime" ? tp.time.timeZone : "UTC";
  return tp.with({ time: { kind: "datetime", instant, timeZone } });
}

export function withZone(tp: TimePlace, instant: Date, local: boolean): TimePlace {
  const timeZone = local && tp.place ? tp.place.timeZone() : "UTC";
  return tp.with({ time: { kind: "datetime", instant, timeZone } });
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;

/** Moves the place, keeping the instant and re-expressing local clocks in the new zone. */
export function withCoords(tp: TimePlace, lat: number, lon: number): TimePlace {
  const place = new Place(round5(lat), round5(((lon + 180) % 360 + 360) % 360 - 180));
  let time = tp.time;
  if (time?.kind === "datetime" && time.timeZone !== "UTC") {
    time = { ...time, timeZone: place.timeZone() };
  }
  return tp.with({ place, time });
}
