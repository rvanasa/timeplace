import { useEffect, useMemo, useState } from "react";
import { NominatimGeocoder, TimePlace, parse } from "timeplace";
import DataPanel from "./components/DataPanel";
import MapView from "./components/MapView";
import TimeBar from "./components/TimeBar";
import { useDebounced, useStateLabel } from "./lib/hooks";
import { clockLabel, localLabel } from "./lib/fmt";
import { momentOf, withCoords, withInstant, withZone } from "./lib/moment";

const DEFAULT_TIMEPLACE = "2026-10-24 14:08z Norman, OK";
const geocoderUserAgent =
  import.meta.env.VITE_TIMEPLACE_USER_AGENT ??
  (import.meta.env.VITE_TIMEPLACE_API_KEY ? `timeplace-web/${import.meta.env.VITE_TIMEPLACE_API_KEY}` : "timeplace-web");
const geocoder = new NominatimGeocoder({ userAgent: geocoderUserAgent }).geocode;
const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const initialText = () => {
  const params = new URLSearchParams(location.search);
  return params.get("timeplace") ?? params.get("tp") ?? DEFAULT_TIMEPLACE;
};

const EXAMPLES = [
  "2022-05-12 6pm Watertown, SD",
  "2023-06-10 8pm Dalhart, TX",
  "2024-06-01 5pm Sterling, CO",
  "2025-06-20 11pm Enderlin, ND",
  "2026-04-23 8pm Enid, OK",
];

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
  const [copied, setCopied] = useState(false);
  const typed = useDebounced(text, 350);

  useEffect(() => {
    document.title = "TimePlace";
  }, []);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    const url = new URL(location.href);
    const hadExplicitTimeplace = url.searchParams.has("timeplace") || url.searchParams.has("tp");

    if (!hadExplicitTimeplace && text === DEFAULT_TIMEPLACE) {
      url.searchParams.delete("timeplace");
      url.searchParams.delete("tp");
      history.replaceState(null, "", url);
      return;
    }

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
  const pickReport = (next: TimePlace) => setText(next.format({ canonical: true }));
  const copyText = async () => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>TimePlace</h1>
        </div>
        <nav className="top-links" aria-label="Project links">
          <a href="https://github.com/rvanasa/timeplace" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.77.6-3.36-1.34-3.36-1.34-.45-1.14-1.1-1.45-1.1-1.45-.9-.62.07-.61.07-.61 1 .07 1.52 1.03 1.52 1.03.89 1.53 2.33 1.09 2.9.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.12-4.56-4.98 0-1.1.39-2 1.03-2.7-.1-.25-.45-1.28.1-2.66 0 0 .84-.27 2.75 1.03A9.55 9.55 0 0 1 12 6.8c.85 0 1.7.11 2.5.33 1.9-1.3 2.74-1.03 2.74-1.03.56 1.38.21 2.41.1 2.66.64.7 1.03 1.6 1.03 2.7 0 3.87-2.35 4.73-4.58 4.98.36.31.68.92.68 1.86v2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
            </svg>
          </a>
          <a href="https://pypi.org/project/timeplace/" target="_blank" rel="noopener noreferrer" aria-label="Python package">
            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" alt="Python" />
          </a>
          <a href="https://www.npmjs.com/package/timeplace" target="_blank" rel="noopener noreferrer" aria-label="TypeScript package">
            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" alt="TypeScript" />
          </a>
        </nav>
      </header>

      <div className="field">
        <div className="field-row">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={DEFAULT_TIMEPLACE}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            aria-label="Timeplace"
          />
          <button
            type="button"
            className={`copy-button${copied ? " copied" : ""}`}
            onClick={copyText}
            aria-label="Copy timeplace text"
            title={copied ? "Copied" : "Copy timeplace text"}
            disabled={!text.trim()}
          >
            {copied ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9.55 17.3 4.7 12.45l1.4-1.4 3.45 3.45 8.35-8.35 1.4 1.4-9.75 9.75Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 9.75A2.75 2.75 0 0 1 11.75 7h7.5A2.75 2.75 0 0 1 22 9.75v7.5A2.75 2.75 0 0 1 19.25 20h-7.5A2.75 2.75 0 0 1 9 17.25v-7.5Zm-5.25 1.5A2.75 2.75 0 0 1 6.5 8.5h7.5A2.75 2.75 0 0 1 16.75 11.25v7.5A2.75 2.75 0 0 1 14 21.5H6.5A2.75 2.75 0 0 1 3.75 18.75v-7.5Z" />
              </svg>
            )}
          </button>
        </div>
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
            onPickReport={pickReport}
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
          {!text.trim() && (
            <section className="examples">
              <header>
                <h2>Examples</h2>
              </header>
              <ul>
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button type="button" onClick={() => setText(ex)}>
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <DataPanel
            tp={tp} instant={moment.instant} timeZone={placeZone ?? "UTC"} state={state}
            onPickReport={pickReport}
          />
        </div>
      </main>
    </div>
  );
}
