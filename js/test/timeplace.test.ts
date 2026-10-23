import { describe, expect, test } from "vitest";
import { Place, TimePlace, TimePlaceError, parse, parseStrict, type Geocoder } from "../src/index.js";

const known: Record<string, Place> = {
  "Boulder, CO": new Place(40.01499, -105.27055, "Boulder, CO"),
  "Arnett, OK": new Place(36.135, -99.77, "Arnett, OK"),
  "Enid, OK": new Place(36.3956, -97.8784, "Enid, OK"),
};
const fake: Geocoder = (q) => known[q] ?? null;
const p = (text: string, tz?: string) => parse(text, { geocoder: fake, tz });

function at(tp: TimePlace): [string, string] {
  if (tp.time?.kind !== "datetime") throw new Error("expected datetime");
  return [tp.time.instant.toISOString(), tp.time.timeZone];
}

describe("parse", () => {
  test("name with local time", async () => {
    const tp = await p("2021-12-30 2pm Boulder, CO # Marshall Fire downslope wind, 100mph");
    expect(at(tp)).toEqual(["2021-12-30T21:00:00.000Z", "America/Denver"]);
    expect(tp.place).toEqual(known["Boulder, CO"]);
    expect(tp.comment).toBe("# Marshall Fire downslope wind, 100mph");
    expect(tp.tags.size).toBe(0);
  });

  test("utc and coords", async () => {
    expect(at(await p("2022-12-02 05z Boulder, CO # Downslope"))).toEqual([
      "2022-12-02T05:00:00.000Z",
      "UTC",
    ]);
    const tp = await p("2018-05-28 5pm 39.62261,-102.97337 # Flagler, multiple landspouts");
    expect(tp.place).toEqual(new Place(39.62261, -102.97337));
    expect(at(tp)[0]).toBe("2018-05-28T23:00:00.000Z");
  });

  test("am/pm edges", async () => {
    expect(at(await p("2026-01-01 12am 1,1", "UTC"))[0]).toBe("2026-01-01T00:00:00.000Z");
    expect(at(await p("2026-01-01 12pm 1,1", "UTC"))[0]).toBe("2026-01-01T12:00:00.000Z");
    expect(at(await p("2026-01-01 6:30 PM 1,1", "UTC"))[0]).toBe("2026-01-01T18:30:00.000Z");
  });

  test("date only and unresolvable local time", async () => {
    expect((await p("2026-1-2")).time).toEqual({ kind: "date", year: 2026, month: 1, day: 2 });
    const tp = await p("2026-01-12 10am Nowhere");
    expect(tp.time).toEqual({ kind: "date", year: 2026, month: 1, day: 12 });
    expect(tp.place).toBeNull();
  });

  test("place name starting like a suffix", async () => {
    expect((await p("2026-01-12 10 amherst")).time?.kind).toBe("date");
  });

  test("comment only and empty", async () => {
    expect(await p("#rotorcloud")).toEqual(new TimePlace({ comment: "#rotorcloud" }));
    expect((await p("")).time).toBeNull();
  });

  test("tags", async () => {
    const tp = await p("2026-10-21 1,1 #Photogenic #supercell https://x.com/a#frag #a-b # no #photogenic");
    expect(tp.tags).toEqual(new Set(["photogenic", "supercell", "a-b"]));
  });

  test("invalid values", async () => {
    for (const bad of ["2026-13-01", "2026-01-01 13pm 1,1", "2026-01-01 25z", "100,0"]) {
      await expect(p(bad)).rejects.toThrow(TimePlaceError);
    }
  });

  test("geocoder failure keeps time and comment", async () => {
    const tp = await parse("2026-01-12 10am Nowhere # hi", { geocoder: () => null });
    expect(tp.place).toBeNull();
    expect(tp.comment).toBe("# hi");
    expect(tp.time?.kind).toBe("date");
  });
});

describe("parseStrict", () => {
  test("accepts strict form", () => {
    const tp = parseStrict("2022-12-02 05z 40.01499,-105.27055 # hi");
    expect(tp.place).toEqual(new Place(40.01499, -105.27055));
  });

  test("rejects everything else", () => {
    for (const bad of ["Boulder, CO", "2022-12-02 5pm 1,1", "2022-12-02 1,1", "# x"]) {
      expect(() => parseStrict(bad)).toThrow(TimePlaceError);
    }
  });
});

describe("format", () => {
  test("canonical", async () => {
    const tp = await p("2022-12-02 5am Boulder, CO # Downslope");
    expect(tp.format({ canonical: true })).toBe("2022-12-02 12z 40.01499,-105.27055 # Downslope");
    expect((await p("2022-12-02 05z 1.123456,-2.0")).format({ canonical: true })).toBe(
      "2022-12-02 05z 1.12346,-2",
    );
    expect((await p("2022-12-02 05:30z 1,1")).format({ canonical: true })).toBe("2022-12-02 05:30z 1,1");
  });

  test("display round trip", async () => {
    const line = "2025-05-18 5:30pm Arnett, OK # Several tornadoes";
    expect(String(await p(line))).toBe(line);
    const enid = await p("2026-04-23 8pm Enid, OK #tornado #ef4");
    expect(at(enid)).toEqual(["2026-04-24T01:00:00.000Z", "America/Chicago"]);
    expect(enid.tags).toEqual(new Set(["tornado", "ef4"]));
    expect(String(await p("2021-12-30 12:05pm Boulder, CO"))).toBe("2021-12-30 12:05pm Boulder, CO");
    expect(String(await p("2021-12-30 12am Boulder, CO"))).toBe("2021-12-30 12am Boulder, CO");
  });

  test("hash in name is escaped", () => {
    expect(new TimePlace({ place: new Place(1, 2, "A#B") }).format()).toBe("A_B");
  });
});

describe("Place", () => {
  test("validation", () => {
    expect(() => new Place(91, 0)).toThrow(TimePlaceError);
    expect(() => new Place(0, -181)).toThrow(TimePlaceError);
    new Place(-90, 180);
  });

  test("coords and time zone", () => {
    expect(new Place(1.123456, -2).coords).toBe("1.12346,-2");
    expect(new Place(-0.000001, 0).coords).toBe("0,0");
    expect(new Place(40.015, -105.27).timeZone()).toBe("America/Denver");
    expect(new Place(36.4, -97.9).timeZone()).toBe("America/Chicago");
  });
});
