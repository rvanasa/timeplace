# timeplace (npm)

Parse and format **timeplace** lines: a single line of text naming a time, a place, and a comment. See [SPEC.md](../SPEC.md) for the format. Requires Node 24+; ESM only.

```
2025-05-18 5:30pm Arnett, OK # Several tornadoes
2022-12-02 05z 40.01499,-105.27055 # Downslope windstorm, 50-80mph
```

## Install

```sh
npm install timeplace
```

## Parsing

Every part of a line is optional, but the order is always time, place, comment. `parse` is async because place names are geocoded with Nominatim (OpenStreetMap).

```ts
import { parse } from "timeplace";

const tp = await parse("2021-12-30 2pm Boulder, CO # Marshall Fire downslope wind, 100mph");
tp.time;     // { kind: "datetime", instant: Date(2021-12-30T21:00:00Z), timeZone: "America/Denver" }
tp.place;    // Place { lat: 40.01..., lon: -105.27..., name: "Boulder, CO" }
tp.comment;  // "# Marshall Fire downslope wind, 100mph"
```

Local clock times (`am`/`pm`) use the time zone of the place; `z` times are UTC (`timeZone: "UTC"`). A date without a resolvable clock time is `{ kind: "date", year, month, day }`. Missing parts are `null`.

If geocoding fails, `tp.place` is `null` and the time and comment are still returned. When the place is missing or unresolved, pass a fallback zone with `tz`:

```ts
await parse("2026-01-12 10am", { tz: "America/Denver" });
```

Invalid values throw `TimePlaceError`.

### Strict mode

`parseStrict` is synchronous, accepts only `[date clock(z)] lat,lon [comment]`, never geocodes, and throws `TimePlaceError` for anything else.

```ts
parseStrict("2022-12-02 05z 40.01499,-105.27055 # hi");
```

## Tags

`tp.tags` is a `Set` of lowercased `#word` tokens from the comment. `# text` and URL fragments are not tags.

## Formatting

`tp.toString()` / `tp.format()` gives the display form (local time, place name). `tp.format({ canonical: true })` gives UTC time and `lat,lon` rounded to 5 decimals.

## Building values directly

```ts
import { Place, TimePlace } from "timeplace";

const tp = new TimePlace({
  time: { kind: "datetime", instant: new Date("2026-04-23T20:00:00Z"), timeZone: "UTC" },
  place: new Place(36.3956, -97.8784, "Enid, OK"),
  comment: "#tornado #ef4",
});
tp.format({ canonical: true }); // "2026-04-23 20z 36.3956,-97.8784 #tornado #ef4"
tp.with({ comment: "# updated" });
new Place(36.3956, -97.8784).timeZone(); // "America/Chicago"
```

## Geocoding

The default geocoder caches results in memory and limits requests to 1 per second, as the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires. Failures resolve to `null`.

```ts
import { createNominatimGeocoder, parse } from "timeplace";

const geocoder = createNominatimGeocoder({ userAgent: "my-app/1.0 (me@example.com)" });
await parse("2025-05-18 5:30pm Arnett, OK", { geocoder });
```

A geocoder is any `(query: string) => Place | null | Promise<Place | null>`, so offline lookups and test doubles are easy. Browsers ignore the `User-Agent` header, so Nominatim identifies browser clients by `Referer`.

## Development

```sh
npm install
npm test               # offline: fetch is mocked
LIVE=1 npm test        # also run against the real Nominatim service
npm run typecheck
npm run build
```
