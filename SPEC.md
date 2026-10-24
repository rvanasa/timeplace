# TimePlace Format Specification

Version: 0.1 (draft)

A **timeplace** (or TimePlace) is a single line of text naming a moment, a place, and an optional free-form comment. It is designed for sharing weather events in chat, social media, and notes, while remaining easy to parse.

## Examples

```
2025-05-18 5:30pm Arnett, OK # Several tornadoes
2026-04-23 8pm Enid, OK #tornado #ef4
2026-10-21 6:30pm Show Low, AZ #photogenic #supercell https://x.com/craigmatthews48/status/2113036632744218761
2021-12-30 2pm Boulder, CO # Marshall Fire downslope wind, 100mph
2022-12-02 05z Boulder, CO # Downslope wind, 50-80mph
2022-12-02 05Z Boulder, CO # identical UTC time using capital Z
2018-05-28 5pm 39.62261,-102.97337 # Flagler, CO - multiple landspouts
```

## Grammar

```
timeplace = [ time ] [ SP ] [ place ] [ comment ]
time      = date [ SP clock ]
date      = YYYY "-" M[M] "-" D[D]
clock     = H[H] [ ":" MM ] zone
zone      = "z" / "Z" / "am" / "pm" / SP "AM" / SP "PM"
place     = coords / name
coords    = lat [ WS ] "," [ WS ] lon
name      = 1*( any char except "#" )
comment   = "#" *( any char )
```

All components are optional in the lenient syntax; a line may be only a date, only a place, only a comment, or any combination, but the order is always time, place, comment.

## Components

### Time

- Date is ISO 8601 calendar date `YYYY-MM-DD`. Month and day may omit leading zeros.
- Clock time is optional. Without a clock time, the value is a date only.
- Hour may be 1 or 2 digits; minutes are optional (`:MM`) and default to `00`.
- Suffix:
  - UTC is written with either lowercase `z` or uppercase `Z`; both are accepted and mean the same thing (`05z` and `05Z` are both valid UTC times). 24-hour clock format is used (`05z`, `18:30z`); `1830z`-style is NOT allowed.
  - `am` / `pm` (case-insensitive): 12-hour local time. `12am` is midnight, `12pm` is noon.
- Local times are interpreted in the time zone of the place. If the place is absent and no zone is supplied by the client, a local clock time is unresolvable and clients should treat it as time-unknown.
- Local times that are ambiguous or nonexistent due to DST transitions should be resolved per the client's time zone library; authors should prefer `z` for those hours.

### Place

Two forms:

1. **Name**: free text resolved with [Nominatim](https://nominatim.org/) search (OpenStreetMap), e.g. `Arnett, OK`, `Show Low, AZ`. Leading and trailing whitespace is trimmed. Names must not contain `#` (writers replace it with `_`).
2. **Coordinates**: `lat,lon` in decimal degrees, WGS84, positive north/east, optional whitespace around the comma (`39.62261,-102.97337`). Writers should use at most 5 decimal places (about 1 m).

Valid ranges: lat in $[-90, 90]$, lon in $[-180, 180]$.

### Comment

Everything from the first `#` to end of line is the comment, including the `#`. Whether or not a space follows the `#`, the comment is opaque free text. The `#` terminates the place, so place names cannot contain `#`.

### Tags

Clients extract tags from the comment with:

```
#(\w[\w\-_]*)
```

- A tag is `#` followed by a word character, then word characters or `-`.
- Tags are case-insensitive for matching; clients should lowercase them for comparison but may preserve case for display.
- Tags form a set (duplicates collapse). Order is not significant.
- A `#` followed by whitespace (`# Marshall Fire`) is the comment delimiter and not a tag.
- URLs and other text in the comment are preserved verbatim. Clients should not extract tags from URL fragments (`https://example.com/page#section`); a tag must be preceded by start-of-comment or whitespace.

Suggested weather tags (non-normative): `#supercell`, `#tornado`, `#landspout`, `#rotorcloud`, `#photogenic`, `#hail`, `#downslope`, `#wildfire`.

## Strict subset

The strict form is machine-oriented and requires no geocoding:

```
strict = [ date SP clock ] SP lat "," lon [ SP comment ]
```

- Place must be a `lat,lon` pair (whitespace around comma allowed).
- Clock time, if present, should be UTC (`z`) so no time zone lookup is needed.
- Strict parsers reject place names.

## Canonical form

Writers producing the canonical form must:

- Convert time to UTC: `YYYY-MM-DD HH[:MM]z` with 2-digit month/day, minutes omitted when zero (`2022-12-02 05z`).
- Write the place as `lat,lon` rounded to at most 5 decimals with no spaces.
- Keep the comment unchanged.

Canonical lines are strict-valid and compare equal when they describe the same moment and place.

Non-canonical (display) form keeps local time with `am`/`pm` and the place name.

## Parsing

1. Match an optional date and clock at the start of the line.
2. The remainder up to the first `#` is the place text, trimmed.
3. If the place text matches the `coords` production, use it directly; otherwise geocode via Nominatim.
4. Everything from the first `#` is the comment; derive tags from it.
5. Resolve local clock times using the place's time zone (from coordinates).

Parsers must not fail on unknown content in the comment. If geocoding fails, the place is unresolved but the time and comment are still returned.

## Nominatim usage

Clients must follow the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): identify with a User-Agent, cache results, and limit to 1 request per second. Clients should cache name-to-coordinate results; resolved coordinates are preferred when storing or exchanging data.

## Reference implementation

`src/time_place.py` in the `wx-nowcast` project (`TimePlace.parse`, `TimePlace.format`, `TimePlace.tags`).

## Known gaps for future versions

- Time ranges (`10am-12pm`) and fractional/second precision.
- Explicit UTC offsets (`-07:00`).
- 24-hour local time without a suffix.
- Elevation/altitude and radius/uncertainty on places.
