import datetime as dt
import time
from types import SimpleNamespace
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from geopy.exc import GeocoderServiceError

import timeplace.geo as geo
from timeplace import NominatimGeocoder, Place, parse


class FakeNominatim:
    """Stands in for geopy's Nominatim client."""

    instances: list["FakeNominatim"] = []
    results: dict[str, Any] = {}

    def __init__(self, user_agent: str, timeout: float) -> None:
        self.user_agent = user_agent
        self.timeout = timeout
        self.queries: list[str] = []
        FakeNominatim.instances.append(self)

    def geocode(self, query: str) -> Any:
        self.queries.append(query)
        result = self.results.get(query)
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture
def fake_client(monkeypatch: pytest.MonkeyPatch) -> type[FakeNominatim]:
    FakeNominatim.instances = []
    FakeNominatim.results = {
        "Boulder, CO": SimpleNamespace(latitude=40.015, longitude=-105.27),
    }
    monkeypatch.setattr(geo, "Nominatim", FakeNominatim)
    return FakeNominatim


def test_place_validation() -> None:
    with pytest.raises(ValueError):
        Place(91, 0)
    with pytest.raises(ValueError):
        Place(0, -181)
    Place(-90, 180)


def test_place_coords_formatting() -> None:
    assert Place(1.123456, -2.0).coords == "1.12346,-2"
    assert Place(-0.000001, 0).coords == "0,0"
    assert Place(40.5, -105.25).coords == "40.5,-105.25"


def test_place_timezone() -> None:
    assert Place(40.015, -105.27).timezone() == ZoneInfo("America/Denver")
    assert Place(36.4, -97.9).timezone() == ZoneInfo("America/Chicago")


def test_geocoder_success_and_user_agent(fake_client: type[FakeNominatim]) -> None:
    g = NominatimGeocoder("my-agent", timeout=3, min_interval=0)
    assert g("Boulder, CO") == Place(40.015, -105.27, "Boulder, CO")
    client = fake_client.instances[0]
    assert (client.user_agent, client.timeout) == ("my-agent", 3)


def test_geocoder_caches_hits_and_misses(fake_client: type[FakeNominatim]) -> None:
    g = NominatimGeocoder(min_interval=0)
    for _ in range(3):
        assert g("Boulder, CO") is not None
        assert g("Nowhere") is None
    assert fake_client.instances[0].queries == ["Boulder, CO", "Nowhere"]


def test_geocoder_service_error_returns_none_and_is_not_cached(
    fake_client: type[FakeNominatim],
) -> None:
    fake_client.results["Flaky"] = GeocoderServiceError("boom")
    g = NominatimGeocoder(min_interval=0)
    assert g("Flaky") is None
    fake_client.results["Flaky"] = SimpleNamespace(latitude=1.0, longitude=2.0)
    assert g("Flaky") == Place(1.0, 2.0, "Flaky")


def test_geocoder_rate_limit(
    fake_client: type[FakeNominatim], monkeypatch: pytest.MonkeyPatch
) -> None:
    now = [100.0]
    sleeps: list[float] = []

    def sleep(seconds: float) -> None:
        sleeps.append(seconds)
        now[0] += seconds

    monkeypatch.setattr(time, "monotonic", lambda: now[0])
    monkeypatch.setattr(time, "sleep", sleep)
    fake_client.results["A"] = SimpleNamespace(latitude=1.0, longitude=1.0)
    fake_client.results["B"] = SimpleNamespace(latitude=2.0, longitude=2.0)

    g = NominatimGeocoder(min_interval=1.0)
    g("A")
    assert sleeps == []  # first request is immediate
    now[0] += 0.25
    g("B")
    assert sleeps == [pytest.approx(0.75)]
    g("A")  # cached: no wait
    assert len(sleeps) == 1


def test_parse_uses_default_geocoder(
    fake_client: type[FakeNominatim], monkeypatch: pytest.MonkeyPatch
) -> None:
    import timeplace.core as core

    monkeypatch.setattr(core, "_default_geocoder", None)
    monkeypatch.setattr(time, "sleep", lambda _s: None)
    tp = parse("2021-12-30 2pm Boulder, CO")
    assert tp.place == Place(40.015, -105.27, "Boulder, CO")
    assert tp.time == dt.datetime(2021, 12, 30, 14, tzinfo=ZoneInfo("America/Denver"))
    parse("Boulder, CO")  # default geocoder instance is reused and cached
    assert len(fake_client.instances) == 1
    assert fake_client.instances[0].queries == ["Boulder, CO"]


def test_parse_geocoder_failure_keeps_time_and_comment() -> None:
    tp = parse("2026-01-12 10am Nowhere # hi", geocoder=lambda _q: None)
    assert tp.place is None
    assert tp.comment == "# hi"
    assert str(tp.time) == "2026-01-12"


def test_strict_never_geocodes() -> None:
    def boom(_q: str) -> Place | None:
        raise AssertionError("geocoder called")

    assert parse("2022-12-02 05z 1,2", geocoder=boom, strict=True).place == Place(1, 2)
    with pytest.raises(ValueError):
        parse("Boulder, CO", geocoder=boom, strict=True)
