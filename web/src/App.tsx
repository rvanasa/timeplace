import { useEffect, useMemo, useState } from "react";
import { NominatimGeocoder, TimePlace, parse } from "timeplace";
import DataPanel from "./components/DataPanel";
import MapView from "./components/MapView";
import TimeBar from "./components/TimeBar";
import { useDebounced, useStateLabel } from "./lib/hooks";
import { clockLabel, isoDate, localLabel, utcClock } from "./lib/fmt";
import { momentOf, withCoords, withInstant, withZone } from "./lib/moment";

const EXAMPLE = "2025-05-18 5:30pm Arnett, OK # Several tornadoes";

const nowInNorman = () => {
  const now = new Date();
  return `${isoDate(now)} ${utcClock(now)} Norman, OK`;
};
const geocoderUserAgent =
  import.meta.env.VITE_TIMEPLACE_USER_AGENT ??
  (import.meta.env.VITE_TIMEPLACE_API_KEY ? `timeplace-web/${import.meta.env.VITE_TIMEPLACE_API_KEY}` : "timeplace-web");
const geocoder = new NominatimGeocoder({ userAgent: geocoderUserAgent }).geocode;
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const initialText = () => {
  const params = new URLSearchParams(location.search);
  return params.get("timeplace") ?? params.get("tp") ?? nowInNorman();
};

const URL_RE = /(https?:\/\/[^\s]+)/g;
const LEADING_TIME_RE = /^\s*\d{4}-\d{1,2}-\d{1,2}(?: \d{1,2}(?::\d{2})?\s?(?:z|am|pm))?/i;

const hasPlaceText = (line: string): boolean => (line.replace(LEADING_TIME_RE, "").split("#")[0] ?? "").trim() !== "";

function Comment({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function App() {
  const [text, setText] = useState(initialText);
  const [tp, setTp] = useState<TimePlace>(() => new TimePlace());
  const [busy, setBusy] = useState(false);
  const typed = useDebounced(text, 350);

  useEffect(() => {
    const url = new URL(location.href);
    if (text.trim()) url.searchParams.set("timeplace", text);
    else url.searchParams.delete("timeplace");
    url.searchParams.delete("tp");
    history.replaceState(null, "", url);
  }, [text]);

  useEffect(() => {
    let stale = false;
    setBusy(true);
    parse(typed, { geocoder, tz: browserZone })
      .then((result) => !stale && setTp(result))
      .catch(() => !stale && setTp(new TimePlace({ comment: null })))
      .finally(() => !stale && setBusy(false));
    return () => {
      stale = true;
    };
  }, [typed]);

  const moment = useMemo(() => momentOf(tp.time), [tp.time]);
  const placeZone = tp.place?.timeZone() ?? null;
  const timeZone = tp.time?.kind === "datetime" ? tp.time.timeZone : "UTC";
  const local = timeZone !== "UTC";
  const caption = [
    local ? clockLabel(moment.instant, "UTC") : placeZone ? localLabel(moment.instant, placeZone) : null,
    moment.note,
  ]
    .filter(Boolean)
    .join(" · ");
  const state = useStateLabel(tp.place?.lat ?? null, tp.place?.lon ?? null);
  const tags = [...tp.tags];
  const unresolved = !busy && tp.place === null && hasPlaceText(typed);

  const commit = (next: TimePlace) => setText(next.format());

  return (
    <div className="app">
      <header className="top">
        <h1>timeplace</h1>
        <a href="https://github.com/rvanasa/timeplace" target="_blank" rel="noopener noreferrer">
          spec &amp; libraries
        </a>
      </header>

      <div className="field">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Timeplace"
        />
        <p className="status muted" aria-live="polite">
          {busy ? "resolving…" : unresolved ? "place not found" : tp.place ? `${tp.place.coords}${placeZone ? ` · ${placeZone}` : ""}` : ""}
          {tags.length > 0 && <span className="tags">{tags.map((t) => ` #${t}`)}</span>}
        </p>
      </div>

      <main>
        <div className="left">
          <MapView
            lat={tp.place?.lat ?? null}
            lon={tp.place?.lon ?? null}
            instant={moment.instant}
            onMove={(lat, lon) => commit(withCoords(tp, lat, lon))}
          />
          <TimeBar
            instant={moment.instant}
            zone={timeZone}
            local={local}
            canLocal={placeZone !== null}
            caption={caption}
            onLocalChange={(l) => commit(withZone(tp, moment.instant, l))}
            onChange={(instant) => commit(withInstant(tp, instant))}
          />
          {tp.comment && (
            <p className="comment">
              <Comment text={tp.comment} />
            </p>
          )}
        </div>
        <div className="right">
          <DataPanel tp={tp} instant={moment.instant} timeZone={placeZone ?? "UTC"} state={state} />
        </div>
      </main>
    </div>
  );
}
