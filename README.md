# timeplace

Parse and format **timeplace** lines: a single line of text naming a time, a place, and a comment/tag section.

```
2026-04-23 8pm Enid, OK #tornado #ef4
```

The goal is to define a standard, plain-text format for severe weather events for interoperability between weather analysis tools (radar, satellite, reanalysis, storm report, and sounding retrieval, plotting).

The format is not specific to weather. It works for any use case that involves a time and a place: earthquakes, wildfires, field observations, photos.

```
2025-05-18 5:30pm Arnett, OK # Several tornadoes
2022-12-02 05z 40.01499,-105.27055 # Downslope windstorm, 50-80mph
2024-04-08 1:30pm Dallas, TX #eclipse
```

## Motivation

Severe weather research often starts with a list of events: "the Enid, OK tornado", "the supercell in southeast Colorado on 7/8/23". In order to view radar, satellite, weather models, etc. for a case study, it is often necessary to use either a centralized database such as Chase Archive or Tornado Archive or manually plug the date/time into each analysis tool.

`timeplace` is a standard text format to solve this problem.

- **Time zone.** `5:30pm` is interpreted in the local zone of the place (DST included). Use `z` for UTC when exactness matters.
- **Place.** A name (`Arnett, OK`) or a `lat,lon` pair. Names are geocoded; coordinates need no lookup.
- **Context.** The comment and `#tags` stay on the same line as the time and place, so they cannot be separated.
- **Typing.** It is easy to write on a phone in the field and to read in a chat. No schema, no CSV quoting.

Any line can be normalized to a canonical form (UTC time, `lat,lon`) to remove the need for geolocation:

```
2026-04-23 8pm Enid, OK #tornado #ef4   ->   2026-04-24 01z 36.39559,-97.87839 #tornado #ef4
```

Canonical lines need no geocoding or time zone data to read, so they are safe to store in datasets and exchange between tools.

## Quick start

### Python (3.12+)

```sh
pip install timeplace      # or: uv add timeplace
```

```python
from timeplace import parse

tp = parse("2026-04-23 8pm Enid, OK #tornado #ef4")
tp.time      # datetime(2026, 4, 23, 20, 0, tzinfo=ZoneInfo('America/Chicago'))
tp.place     # Place(lat=36.39..., lon=-97.87..., name='Enid, OK')
tp.comment   # '#tornado #ef4'
tp.tags      # frozenset({'tornado', 'ef4'})

tp.format(canonical=True)  # '2026-04-24 01z 36.39559,-97.87839 #tornado #ef4'
```

### JavaScript / TypeScript (Node 20+, ESM)

```sh
npm install timeplace
```

```ts
import { parse } from "timeplace";

const tp = await parse("2026-04-23 8pm Enid, OK #tornado #ef4");
tp.time;     // { kind: "datetime", instant: Date(2026-04-24T01:00:00Z), timeZone: "America/Chicago" }
tp.place;    // Place { lat: 36.39..., lon: -97.87..., name: "Enid, OK" }
tp.format({ canonical: true }); // "2026-04-24 01z 36.39559,-97.87839 #tornado #ef4"
```

Every part is optional; the order is always time, place, comment. See the [Python](python/README.md) and [npm](js/README.md) docs for the full API.

## Working with event lists

Keep one event per line in a text file:

```
2026-04-23 8pm Enid, OK #tornado #ef4
2025-05-18 5:30pm Arnett, OK #tornado # Several tornadoes
2018-05-28 5pm 39.62261,-102.97337 #landspout # Flagler, CO
2022-12-02 05z Boulder, CO #downslope #wind
```

Python: load events, normalize to canonical lines, and select by tag. Geocoded names are cached and rate-limited to 1 request per second.

```python
from pathlib import Path
from timeplace import parse

events = []
for line in Path("cases.txt").read_text().splitlines():
    if not line.strip():
        continue
    try:
        events.append(parse(line))
    except ValueError as e:
        print(f"skipped {line!r}: {e}")

for tp in events:
    if tp.place is None:
        continue                      # geocoding failed; time and comment are still available
    print(tp.format(canonical=True))  # exact, geocoding-free line to save or share

tornadoes = [tp for tp in events if "tornado" in tp.tags]
```

`tp.time` is a timezone-aware `datetime` (convert with `.astimezone(dt.UTC)`), and `tp.place.lat` / `tp.place.lon` are decimal degrees, ready to feed into your data-retrieval code.

TypeScript: the same flow.

```ts
import { readFileSync } from "node:fs";
import { parse, TimePlaceError } from "timeplace";

for (const line of readFileSync("cases.txt", "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const tp = await parse(line);
    if (tp.time?.kind === "datetime" && tp.place) {
      console.log(tp.time.instant.toISOString(), tp.place.lat, tp.place.lon, [...tp.tags]);
    }
  } catch (e) {
    if (!(e instanceof TimePlaceError)) throw e;
    console.warn(`skipped ${JSON.stringify(line)}: ${e.message}`);
  }
}
```

## Using the format in your application

- **Accept lenient input, store canonical output.** Parse what users type, then save `format(canonical=True)` (Python) or `format({ canonical: true })` (JS).
- **Use strict mode for machine data.** `parse(text, strict=True)` / `parseStrict(text)` accept only `[date clock(z)] lat,lon [comment]`, never geocode, and reject everything else.
- **Handle partial results.** If a name cannot be geocoded, the place is `None`/`null` but the time and comment are still returned. A local clock time with no place needs a fallback zone: `parse(text, tz=ZoneInfo("America/Denver"))` or `parse(text, { tz: "America/Denver" })`.
- **Respect Nominatim.** The default geocoder sends a User-Agent, caches in memory, and limits to 1 request per second. Set your own User-Agent for your app, or pass any function `name -> Place | None` for offline or test use. Prefer storing resolved coordinates over re-geocoding.
- **Validate at the edge.** Out-of-range months, hours, or latitudes raise `ValueError` (Python) or `TimePlaceError` (JS).
- **Prefer `z` for DST hours.** Local times in a repeated or skipped hour are resolved by the time zone library; `z` avoids the ambiguity.

## Format at a glance

| Part | Forms | Notes |
| --- | --- | --- |
| Time | `2025-05-18`, `2025-05-18 5:30pm`, `2022-12-02 05z`, `2022-12-02 18:30z` | `am`/`pm` is local to the place; `z` is UTC, 24-hour. Date alone is allowed. |
| Place | `Arnett, OK`, `40.01499,-105.27055` | Names are geocoded (Nominatim); coordinates are WGS84 decimal degrees. Names cannot contain `#`. |
| Comment | `# any text`, `#tornado #ef4` | Starts at the first `#`. `#word` tokens (preceded by start or whitespace) are tags, lowercased; `# text` and URL fragments are not. |

Not supported: time ranges, UTC offsets such as `-07:00`, 24-hour local time without a suffix, elevation, and place uncertainty. The full grammar, strict subset, and canonical form are in [SPEC.md](SPEC.md) (version 0.1, draft).

## Specification and implementations

| Directory | Package | Registry | Docs |
| --- | --- | --- | --- |
| [python/](python/) | `timeplace` | PyPI | [python/README.md](python/README.md) |
| [js/](js/) | `timeplace` | npm | [js/README.md](js/README.md) |

Releases are tagged `py-v*` (PyPI) and `js-v*` (npm).
