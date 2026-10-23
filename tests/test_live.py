"""Hit the real Nominatim service. Run with: pytest --live"""

import datetime as dt
from zoneinfo import ZoneInfo

import pytest

from timeplace import NominatimGeocoder, parse

pytestmark = pytest.mark.live


@pytest.fixture(scope="module")
def geocoder() -> NominatimGeocoder:
    return NominatimGeocoder("timeplace-tests")


def test_geocode_boulder(geocoder: NominatimGeocoder) -> None:
    place = geocoder("Boulder, CO")
    assert place is not None
    assert place.lat == pytest.approx(40.0, abs=0.2)
    assert place.lon == pytest.approx(-105.27, abs=0.2)
    assert place.timezone() == ZoneInfo("America/Denver")


def test_unknown_place(geocoder: NominatimGeocoder) -> None:
    assert geocoder("qzxvwkjh nowhereville xyzzy 99999") is None


def test_parse_end_to_end(geocoder: NominatimGeocoder) -> None:
    tp = parse("2021-12-30 2pm Boulder, CO # Marshall Fire", geocoder=geocoder)
    assert tp.time == dt.datetime(2021, 12, 30, 14, tzinfo=ZoneInfo("America/Denver"))
    assert tp.format(canonical=True).startswith("2021-12-30 21z 40.")
