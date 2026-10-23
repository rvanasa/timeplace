import { describe, expect, test } from "vitest";
import { NominatimGeocoder, Place, createNominatimGeocoder, parse } from "../src/index.js";

function fakeFetch(results: Record<string, unknown>) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: init?.headers as Record<string, string> });
    const r = results[url.searchParams.get("q")!];
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r ?? []), { status: 200 });
  }) as typeof fetch;
  return { fn, calls };
}

const boulder = [{ lat: "40.015", lon: "-105.27" }];

describe("NominatimGeocoder", () => {
  test("success and user agent", async () => {
    const { fn, calls } = fakeFetch({ "Boulder, CO": boulder });
    const g = new NominatimGeocoder({ userAgent: "my-agent", minIntervalMs: 0, fetch: fn });
    expect(await g.geocode("Boulder, CO")).toEqual(new Place(40.015, -105.27, "Boulder, CO"));
    expect(calls[0]!.headers["User-Agent"]).toBe("my-agent");
  });

  test("caches hits and misses", async () => {
    const { fn, calls } = fakeFetch({ "Boulder, CO": boulder });
    const g = new NominatimGeocoder({ minIntervalMs: 0, fetch: fn });
    for (let i = 0; i < 3; i++) {
      expect(await g.geocode("Boulder, CO")).not.toBeNull();
      expect(await g.geocode("Nowhere")).toBeNull();
    }
    expect(calls.map((c) => c.url.searchParams.get("q"))).toEqual(["Boulder, CO", "Nowhere"]);
  });

  test("service error returns null and is not cached", async () => {
    const results: Record<string, unknown> = { Flaky: new Error("boom") };
    const { fn } = fakeFetch(results);
    const g = new NominatimGeocoder({ minIntervalMs: 0, fetch: fn });
    expect(await g.geocode("Flaky")).toBeNull();
    results.Flaky = [{ lat: "1", lon: "2" }];
    expect(await g.geocode("Flaky")).toEqual(new Place(1, 2, "Flaky"));
  });

  test("rate limits requests", async () => {
    const { fn } = fakeFetch({ A: [{ lat: "1", lon: "1" }], B: [{ lat: "2", lon: "2" }] });
    const g = new NominatimGeocoder({ minIntervalMs: 200, fetch: fn });
    const start = Date.now();
    await Promise.all([g.geocode("A"), g.geocode("B")]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(190);
  });

  test("works as a parse geocoder", async () => {
    const { fn } = fakeFetch({ "Boulder, CO": boulder });
    const geocoder = createNominatimGeocoder({ minIntervalMs: 0, fetch: fn });
    const tp = await parse("2021-12-30 2pm Boulder, CO", { geocoder });
    expect(tp.place).toEqual(new Place(40.015, -105.27, "Boulder, CO"));
  });
});

describe.skipIf(!process.env.LIVE)("live Nominatim (LIVE=1)", () => {
  test("parse end to end", async () => {
    const geocoder = createNominatimGeocoder({ userAgent: "timeplace-tests" });
    const tp = await parse("2021-12-30 2pm Boulder, CO # Marshall Fire", { geocoder });
    expect(tp.format({ canonical: true })).toMatch(/^2021-12-30 21z 40\./);
  });
});
