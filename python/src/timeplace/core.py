"""Parsing and formatting of timeplace lines."""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, replace

from .geo import Geocoder, NominatimGeocoder, Place

_LINE_RE = re.compile(
    r"""
    \s*
    (?:
        (?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})
        (?:[ ](?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?(?P<zone>z|am|pm|[ ]am|[ ]pm)(?![a-z]))?
    )?
    \s*
    (?P<place>[^#]*)
    (?P<comment>\#.*)?
    """,
    re.IGNORECASE | re.VERBOSE | re.DOTALL,
)
_NUM = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)"
_COORDS_RE = re.compile(rf"({_NUM})\s*,\s*({_NUM})")
_TAG_RE = re.compile(r"(?:^|(?<=\s))#(\w[\w\-]*)")

_default_geocoder: Geocoder | None = None


def _get_default_geocoder() -> Geocoder:
    global _default_geocoder
    if _default_geocoder is None:
        _default_geocoder = NominatimGeocoder()
    return _default_geocoder


@dataclass(frozen=True, slots=True)
class TimePlace:
    """A moment, a place, and a comment; every part is optional.

    `time` is a timezone-aware `datetime`, a plain `date` (no clock time, or an
    unresolvable local time), or `None`.
    """

    time: dt.datetime | dt.date | None = None
    place: Place | None = None
    comment: str | None = None

    def __post_init__(self) -> None:
        if isinstance(self.time, dt.datetime) and self.time.tzinfo is None:
            raise ValueError("time must be timezone-aware")

    @property
    def tags(self) -> frozenset[str]:
        return frozenset(t.lower() for t in _TAG_RE.findall(self.comment or ""))

    def replace(self, **changes: object) -> TimePlace:
        return replace(self, **changes)  # type: ignore[arg-type]

    @staticmethod
    def parse(
        text: str,
        *,
        geocoder: Geocoder | None = None,
        tz: dt.tzinfo | None = None,
        strict: bool = False,
    ) -> TimePlace:
        return parse(text, geocoder=geocoder, tz=tz, strict=strict)

    def format(self, *, canonical: bool = False) -> str:
        return format_timeplace(self, canonical=canonical)

    def __str__(self) -> str:
        return self.format()


def parse(
    text: str,
    *,
    geocoder: Geocoder | None = None,
    tz: dt.tzinfo | None = None,
    strict: bool = False,
) -> TimePlace:
    """Parse a timeplace line.

    Names are geocoded with `geocoder` (Nominatim by default); failures leave the
    place unresolved. Local clock times use the place's time zone, else `tz`.
    With `strict=True`, no geocoding happens and `ValueError` is raised for
    anything outside the strict subset.
    """
    m = _LINE_RE.fullmatch(text.strip("\r\n"))
    assert m is not None  # every group is optional and the tail matches anything
    place_text = m["place"].strip()
    comment = m["comment"]

    place: Place | None = None
    if place_text:
        coords = _COORDS_RE.fullmatch(place_text)
        if coords:
            place = Place(float(coords[1]), float(coords[2]))
        elif strict:
            raise ValueError(f"strict form requires lat,lon place: {place_text!r}")
        else:
            place = (geocoder or _get_default_geocoder())(place_text)

    zone = m["zone"].strip().lower() if m["zone"] else None
    if strict:
        if place is None:
            raise ValueError("strict form requires a place")
        if m["year"] is not None and zone is None:
            raise ValueError("strict form requires date and clock together")
        if zone not in (None, "z"):
            raise ValueError("strict form requires UTC (z) clock time")

    time: dt.datetime | dt.date | None = None
    if m["year"] is not None:
        date = dt.date(int(m["year"]), int(m["month"]), int(m["day"]))
        time = date
        if m["hour"] is not None:
            assert zone is not None
            hour, minute = int(m["hour"]), int(m["minute"] or 0)
            if minute > 59:
                raise ValueError(f"invalid minute: {minute}")
            if zone == "z":
                if hour > 23:
                    raise ValueError(f"invalid hour: {hour}")
                tzinfo: dt.tzinfo | None = dt.UTC
            else:
                if not 1 <= hour <= 12:
                    raise ValueError(f"invalid 12-hour clock hour: {hour}")
                hour = hour % 12 + (12 if zone == "pm" else 0)
                tzinfo = (place.timezone() if place else None) or tz
            if tzinfo is not None:
                time = dt.datetime.combine(date, dt.time(hour, minute), tzinfo)

    return TimePlace(time, place, comment)


def format_timeplace(tp: TimePlace, *, canonical: bool = False) -> str:
    parts: list[str] = []
    time = tp.time
    if isinstance(time, dt.datetime):
        if canonical:
            time = time.astimezone(dt.UTC)
        minutes = f":{time.minute:02d}" if time.minute else ""
        if time.tzinfo is dt.UTC:
            clock = f"{time.hour:02d}{minutes}z"
        else:
            clock = f"{(time.hour - 1) % 12 + 1}{minutes}{'pm' if time.hour >= 12 else 'am'}"
        parts.append(f"{time:%Y-%m-%d} {clock}")
    elif time is not None:
        parts.append(f"{time:%Y-%m-%d}")
    if tp.place is not None:
        if canonical or tp.place.name is None:
            parts.append(tp.place.coords)
        else:
            parts.append(tp.place.name.replace("#", "_"))
    if tp.comment is not None:
        parts.append(tp.comment)
    return " ".join(parts)
