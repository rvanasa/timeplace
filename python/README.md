# `timeplace`

Parse and format **timeplace** lines: a single line of text naming a time, a place, and a comment.

```
2025-05-18 5:30pm Arnett, OK # Several tornadoes
2022-12-02 05z 40.01499,-105.27055 # Downslope windstorm, 50-80mph
```

See [SPEC.md](../SPEC.md) for the format. Requires Python 3.12+.

## Install

```sh
uv add timeplace      # or: pip install timeplace
```

## Parsing

Every part of a line is optional, but the order is always time, place, comment.

```python
import datetime as dt
from timeplace import parse

tp = parse("2021-12-30 2pm Boulder, CO # Marshall Fire downslope wind, 100mph")
tp.time     # datetime(2021, 12, 30, 14, 0, tzinfo=ZoneInfo('America/Denver'))
tp.place    # Place(lat=40.01..., lon=-105.27..., name='Boulder, CO')
tp.comment  # '# Marshall Fire downslope wind, 100mph'
```

Place names are geocoded with Nominatim (OpenStreetMap). Local clock times (`am`/`pm`) use the
time zone of the place; `z` times are UTC.

```python
parse("2022-12-02 05z Boulder, CO")            # UTC time
parse("2018-05-28 5pm 39.62261,-102.97337")    # coordinates: no geocoding needed
parse("2026-1-2")                              # date only -> tp.time is a datetime.date
parse("Show Low, AZ")                          # place only
parse("#rotorcloud")                           # comment only
parse("2026-01-12 10am Nowhere")               # geocoding failed: tp.place is None, tp.time is a date
```

`TimePlace.parse(text)` is equivalent to `parse(text)`.

### Fallback time zone

When the place is missing or unresolved, a local clock time cannot be resolved. Supply `tz`:

```python
from zoneinfo import ZoneInfo

tp = parse("2026-01-12 10am", tz=ZoneInfo("America/Denver"))
tp.time  # datetime(2026, 1, 12, 10, 0, tzinfo=ZoneInfo('America/Denver'))
```

### Invalid values

```python
parse("2026-13-01")          # ValueError: month must be in 1..12
parse("2026-01-01 13pm 1,1") # ValueError: invalid 12-hour clock hour
parse("100,0")               # ValueError: latitude out of range
```

### Strict mode

`strict=True` accepts only `[date clock(z)] lat,lon [comment]`, never geocodes, and raises
`ValueError` for anything else. Use it for machine-generated data.

```python
parse("2022-12-02 05z 40.01499,-105.27055 # hi", strict=True)  # OK
parse("Boulder, CO", strict=True)                              # ValueError
parse("2022-12-02 5pm 1,1", strict=True)                       # ValueError (not UTC)
```

## Tags

Tags are `#word` tokens in the comment, lowercased, as a `frozenset`. `# text` (hash then space)
is the comment delimiter, and URL fragments are ignored.

```python
tp = parse("2026-10-21 1,1 #Photogenic #supercell https://x.com/a#frag #a-b")
tp.tags  # frozenset({'photogenic', 'supercell', 'a-b'})
```

## Formatting

`str(tp)` / `tp.format()` gives the display form: local time, place name.
`format(canonical=True)` gives the canonical form: UTC time, `lat,lon` rounded to 5 decimals.

```python
tp = parse("2022-12-02 5am Boulder, CO # Downslope")
str(tp)                        # '2022-12-02 5am Boulder, CO # Downslope'
tp.format(canonical=True)      # '2022-12-02 12z 40.01499,-105.27055 # Downslope'
```

## Building values directly

`TimePlace` is a frozen dataclass; `time` must be timezone-aware (or a `date`).

```python
import datetime as dt
from timeplace import Place, TimePlace

tp = TimePlace(
    time=dt.datetime(2026, 4, 23, 20, tzinfo=dt.UTC),
    place=Place(36.3956, -97.8784, "Enid, OK"),
    comment="#tornado #ef4",
)
tp.format(canonical=True)             # '2026-04-23 20z 36.3956,-97.8784 #tornado #ef4'
tp.replace(comment="# updated")       # new TimePlace with a different comment
Place(36.3956, -97.8784).timezone()   # ZoneInfo('America/Chicago')
Place(91, 0)                          # ValueError
```

## Geocoding

The default geocoder is `NominatimGeocoder`: it sends a `timeplace` User-Agent, caches results
in memory, and limits requests to 1 per second, as the
[Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires.
Failures return `None`.

Use your own user agent or settings:

```python
from timeplace import NominatimGeocoder, parse

geocoder = NominatimGeocoder("my-app/1.0 (me@example.com)", min_interval=1.0, timeout=10)
tp = parse("2025-05-18 5:30pm Arnett, OK", geocoder=geocoder)
```

A geocoder is any `Callable[[str], Place | None]`, so offline lookups and test doubles are easy:

```python
from timeplace import Place, parse

known = {"Boulder, CO": Place(40.01499, -105.27055, "Boulder, CO")}
tp = parse("2021-12-30 2pm Boulder, CO", geocoder=known.get)
```

## Development

```sh
uv sync
uv run pytest          # offline: Nominatim is mocked
uv run pytest --live   # also run tests against the real Nominatim service
uv run ruff check
uv run mypy src tests
```

Live tests are marked `live` and skipped by default. In CI they run only via manual
"Run workflow" with the `live` input enabled.

