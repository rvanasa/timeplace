import datetime as dt
from zoneinfo import ZoneInfo

import pytest

from timeplace import Place, TimePlace, parse

DENVER = ZoneInfo("America/Denver")


def fake_geocoder(query: str) -> Place | None:
    known = {
        "Boulder, CO": Place(40.01499, -105.27055, "Boulder, CO"),
        "Arnett, OK": Place(36.135, -99.77, "Arnett, OK"),
        "Enid, OK": Place(36.3956, -97.8784, "Enid, OK"),
    }
    return known.get(query)


def p(text: str, **kw: object) -> TimePlace:
    return parse(text, geocoder=fake_geocoder, **kw)  # type: ignore[arg-type]


def test_name_local_time() -> None:
    tp = p("2021-12-30 2pm Boulder, CO # Marshall Fire downslope wind, 100mph")
    assert tp.time == dt.datetime(2021, 12, 30, 14, tzinfo=DENVER)
    assert tp.place == Place(40.01499, -105.27055, "Boulder, CO")
    assert tp.comment == "# Marshall Fire downslope wind, 100mph"
    assert tp.tags == frozenset()


def test_utc_and_coords() -> None:
    tp = p("2022-12-02 05z Boulder, CO # Downslope")
    assert tp.time == dt.datetime(2022, 12, 2, 5, tzinfo=dt.UTC)
    tp = p("2022-12-02 05Z Boulder, CO # Downslope")
    assert tp.time == dt.datetime(2022, 12, 2, 5, tzinfo=dt.UTC)
    tp = p("2018-05-28 5pm 39.62261,-102.97337 # Flagler, multiple landspouts")
    assert tp.place == Place(39.62261, -102.97337)
    assert tp.time == dt.datetime(2018, 5, 28, 17, tzinfo=DENVER)


def test_am_pm_edges() -> None:
    assert p("2026-01-01 12am 1,1", tz=dt.UTC).time == dt.datetime(2026, 1, 1, 0, tzinfo=dt.UTC)
    assert p("2026-01-01 12pm 1,1", tz=dt.UTC).time == dt.datetime(2026, 1, 1, 12, tzinfo=dt.UTC)
    assert p("2026-01-01 6:30 PM 1,1", tz=dt.UTC).time == dt.datetime(
        2026, 1, 1, 18, 30, tzinfo=dt.UTC
    )


def test_date_only_and_unresolvable_local() -> None:
    assert p("2026-1-2").time == dt.date(2026, 1, 2)
    assert p("2026-01-12 10am Nowhere").time == dt.date(2026, 1, 12)
    assert p("2026-01-12 10am Nowhere").place is None


def test_place_name_starting_like_suffix() -> None:
    tp = p("2026-01-12 10 amherst")
    assert tp.time == dt.date(2026, 1, 12)


def test_comment_only() -> None:
    tp = p("#rotorcloud")
    assert tp == TimePlace(None, None, "#rotorcloud")
    assert p("").time is None


def test_tags() -> None:
    tp = p("2026-10-21 1,1 #Photogenic #supercell https://x.com/a#frag #a-b # no #photogenic")
    assert tp.tags == {"photogenic", "supercell", "a-b"}


def test_invalid_values() -> None:
    with pytest.raises(ValueError):
        p("2026-13-01")
    with pytest.raises(ValueError):
        p("2026-01-01 13pm 1,1")
    with pytest.raises(ValueError):
        p("2026-01-01 25z")
    with pytest.raises(ValueError):
        p("100,0")


def test_strict() -> None:
    tp = parse("2022-12-02 05z 40.01499,-105.27055 # hi", strict=True)
    assert tp.place == Place(40.01499, -105.27055)
    tp = parse("2022-12-02 05Z 40.01499,-105.27055 # hi", strict=True)
    assert tp.place == Place(40.01499, -105.27055)
    for bad in ("Boulder, CO", "2022-12-02 5pm 1,1", "2022-12-02 1,1", "# x"):
        with pytest.raises(ValueError):
            parse(bad, strict=True)


def test_format_canonical() -> None:
    tp = p("2022-12-02 5am Boulder, CO # Downslope")
    assert tp.format(canonical=True) == "2022-12-02 12z 40.01499,-105.27055 # Downslope"
    assert p("2022-12-02 05z 1.123456,-2.0").format(canonical=True) == "2022-12-02 05z 1.12346,-2"
    assert p("2022-12-02 05:30z 1,1").format(canonical=True) == "2022-12-02 05:30z 1,1"


def test_format_display_roundtrip() -> None:
    line = "2025-05-18 5:30pm Arnett, OK # Several tornadoes"
    assert str(p(line)) == line
    enid = p("2026-04-23 8pm Enid, OK #tornado #ef4")
    assert enid.time == dt.datetime(2026, 4, 23, 20, tzinfo=ZoneInfo("America/Chicago"))
    assert enid.tags == {"tornado", "ef4"}
    assert str(p("2021-12-30 12:05pm Boulder, CO")) == "2021-12-30 12:05pm Boulder, CO"
    assert str(p("2021-12-30 12am Boulder, CO")) == "2021-12-30 12am Boulder, CO"


def test_name_hash_escaped() -> None:
    tp = TimePlace(None, Place(1, 2, "A#B"))
    assert tp.format() == "A_B"


def test_naive_time_rejected() -> None:
    with pytest.raises(ValueError):
        TimePlace(dt.datetime(2026, 1, 1))
