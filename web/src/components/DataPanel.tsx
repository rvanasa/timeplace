import { useEffect, useState, type ReactNode } from "react";
import type { TimePlace } from "timeplace";
import { floorHour, utcClock, isoDate } from "../lib/fmt";
import { externalLinks } from "../lib/links";
import {
  MESO_PARAMS,
  MESO_SECTORS,
  SURFACE_DISPLAYS,
  mesoAvailable,
  mesoBaseLayers,
  mesoRadarUrl,
  mesoUrl,
  nationalForecastUrl,
  nearestSector,
  outlookFor,
  reportsImageUrl,
  surfaceUrl,
} from "../lib/wx";

function Img({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) return <p className="muted">Not available for this time.</p>;
  return <img className="shot" src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <header>
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={id === value} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Mesoanalysis({ lat, lon, instant, now }: { lat: number; lon: number; instant: Date; now: Date }) {
  const [sector, setSector] = useState(() => nearestSector(lat, lon));
  const [auto, setAuto] = useState(true);
  const [params, setParams] = useState(["500mb", "3cvr"]);
  const [overlay, setOverlay] = useState(true);

  useEffect(() => {
    if (auto) setSector(nearestSector(lat, lon));
  }, [auto, lat, lon]);

  if (!mesoAvailable(instant, now)) return <p className="muted">SPC mesoanalysis is not available this far ahead.</p>;

  const toggle = (p: string) => setParams((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  const stacks = overlay ? [params] : params.map((p) => [p]);

  return (
    <>
      <div className="controls">
        <select
          value={sector}
          onChange={(e) => {
            setAuto(false);
            setSector(Number(e.target.value));
          }}
          aria-label="Sector"
        >
          {MESO_SECTORS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {params.length > 1 && (
          <label className="check">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
            overlay
          </label>
        )}
      </div>
      <div className="chips">
        {MESO_PARAMS.map(([id, label]) => (
          <button key={id} className="chip" aria-pressed={params.includes(id)} title={label} onClick={() => toggle(id)}>
            {id}
          </button>
        ))}
      </div>
      {params.length === 0 && <p className="muted">Select a parameter.</p>}
      {stacks.map((stack) => (
        <div key={stack.join("+")}>
          <p className="muted caption">{stack.map((p) => MESO_PARAMS.find(([id]) => id === p)?.[1]).join(" + ")}</p>
          <div className="stack">
            {[...mesoBaseLayers(sector), mesoRadarUrl(instant, sector, now), ...stack.map((p) => mesoUrl(instant, sector, p, now))].map(
              (src, i) => (
                <img key={src} src={src} alt="" loading="lazy" className={i === 0 ? "base" : "over"} />
              ),
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function Outlook({ instant }: { instant: Date }) {
  const [day, setDay] = useState<"1" | "2" | "3">("1");
  const [kind, setKind] = useState("Categorical");
  const outlook = outlookFor(Number(day) as 1 | 2 | 3, instant);
  const tabs: [string, string][] = [["Categorical", "Categorical"], ...outlook.probabilities.map(([n]): [string, string] => [n, n])];
  const current = kind === "Categorical" ? outlook.categorical : outlook.probabilities.find(([n]) => n === kind)?.[1] ?? outlook.categorical;
  return (
    <>
      <div className="controls">
        <Tabs
          value={day}
          options={[["1", "Day 1"], ["2", "Day 2"], ["3", "Day 3"]]}
          onChange={(d) => {
            setDay(d);
            setKind("Categorical");
          }}
        />
        <Tabs value={kind} options={tabs} onChange={setKind} />
      </div>
      <p className="muted caption">
        Issued {isoDate(outlook.issued)} {utcClock(outlook.issued)}
      </p>
      <Img src={current} alt={`SPC day ${day} outlook`} />
    </>
  );
}

function Surface({ instant, now }: { instant: Date; now: Date }) {
  const [display, setDisplay] = useState(SURFACE_DISPLAYS[0]![0]);
  const [forecast, setForecast] = useState(false);
  return (
    <>
      <div className="controls">
        <Tabs value={display} options={SURFACE_DISPLAYS} onChange={setDisplay} />
        <label className="check">
          <input type="checkbox" checked={forecast} onChange={(e) => setForecast(e.target.checked)} />
          WPC forecast
        </label>
      </div>
      <Img src={surfaceUrl(instant, display, now)} alt="WPC surface analysis" />
      {forecast && <Img src={nationalForecastUrl(instant, now)} alt="WPC national forecast" />}
    </>
  );
}

interface Props {
  tp: TimePlace;
  instant: Date;
  timeZone: string;
  state: string | null;
}

export default function DataPanel({ tp, instant, timeZone, state }: Props) {
  const now = new Date();
  const place = tp.place;
  if (!place) {
    return <p className="empty">Add a place to see data for it. Try a name or <code>lat,lon</code>.</p>;
  }
  const links = externalLinks({ lat: place.lat, lon: place.lon, instant, timeZone, state, now });
  const hour = floorHour(instant);

  return (
    <div className="data">
      <Section title="Links">
        <ul className="links">
          {links.map((l) => (
            <li key={l.label}>
              <a href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
              {l.scope && <span className="muted"> {l.scope}</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Mesoanalysis" aside={<span className="muted">{isoDate(hour)} {utcClock(hour)}</span>}>
        <Mesoanalysis lat={place.lat} lon={place.lon} instant={instant} now={now} />
      </Section>
      {instant <= now && (
        <Section title="Storm reports" aside={<span className="muted">12z–12z</span>}>
          <Img src={reportsImageUrl(instant)} alt="SPC storm reports" />
        </Section>
      )}
      <Section title="Surface">
        <Surface instant={instant} now={now} />
      </Section>
      <Section title="Outlook">
        <Outlook instant={instant} />
      </Section>
    </div>
  );
}
