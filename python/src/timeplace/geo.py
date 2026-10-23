"""Geocoding and time zone lookup."""

from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from zoneinfo import ZoneInfo

from geopy.exc import GeopyError
from geopy.geocoders import Nominatim
from timezonefinder import TimezoneFinder


@dataclass(frozen=True, slots=True)
class Place:
    lat: float
    lon: float
    name: str | None = None

    def __post_init__(self) -> None:
        if not -90 <= self.lat <= 90:
            raise ValueError(f"latitude out of range: {self.lat}")
        if not -180 <= self.lon <= 180:
            raise ValueError(f"longitude out of range: {self.lon}")

    @property
    def coords(self) -> str:
        return f"{_fmt_coord(self.lat)},{_fmt_coord(self.lon)}"

    def timezone(self) -> ZoneInfo | None:
        return find_timezone(self.lat, self.lon)


type Geocoder = Callable[[str], Place | None]


def _fmt_coord(value: float) -> str:
    text = f"{value:.5f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


@lru_cache(maxsize=4096)
def find_timezone(lat: float, lon: float) -> ZoneInfo | None:
    key = _tz_finder().timezone_at(lat=lat, lng=lon)
    return ZoneInfo(key) if key else None


@lru_cache(maxsize=1)
def _tz_finder() -> TimezoneFinder:
    return TimezoneFinder()


class NominatimGeocoder:
    """Nominatim geocoder that identifies itself, caches, and limits to 1 request/s."""

    def __init__(
        self,
        user_agent: str = "timeplace",
        *,
        min_interval: float = 1.0,
        timeout: float = 10.0,
    ) -> None:
        self._client = Nominatim(user_agent=user_agent, timeout=timeout)
        self._min_interval = min_interval
        self._cache: dict[str, Place | None] = {}
        self._lock = threading.Lock()
        self._last_request = float("-inf")

    def __call__(self, query: str) -> Place | None:
        with self._lock:
            if query in self._cache:
                return self._cache[query]
            wait = self._last_request + self._min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            try:
                result = self._client.geocode(query)
            except GeopyError:  # service errors leave the place unresolved
                return None
            finally:
                self._last_request = time.monotonic()
            place = Place(result.latitude, result.longitude, query) if result else None
            self._cache[query] = place
            return place
