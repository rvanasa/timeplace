import { useEffect, useState } from "react";
import { DAY, HOUR, MINUTE_MS, clockLabel, fromZoned, pad, zonedIsoDate, zonedParts } from "../lib/fmt";

interface Props {
  instant: Date;
  /** Zone the time is expressed and edited in (`"UTC"` or an IANA name). */
  zone: string;
  local: boolean;
  canLocal: boolean;
  /** The same moment in the other zone, plus any assumption notes. */
  caption: string;
  onLocalChange: (local: boolean) => void;
  onChange: (instant: Date) => void;
}

const SLIDER_STEP = 5;

export default function TimeBar({ instant, zone, local, canLocal, caption, onLocalChange, onChange }: Props) {
  const parts = zonedParts(instant, zone);
  const minute = Math.floor(parts.minute / SLIDER_STEP) * SLIDER_STEP;
  const [dragging, setDragging] = useState<number | null>(null);
  useEffect(() => setDragging(null), [instant]);

  const step = (ms: number) => onChange(new Date(instant.getTime() + ms));
  const setDay = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    if (year && month && day) onChange(fromZoned({ year, month, day, minute: parts.minute }, zone));
  };
  // The slider only commits on release so the map and data don't reload while dragging.
  const commit = () => {
    if (dragging === null) return;
    if (dragging === minute) setDragging(null);
    else onChange(fromZoned({ ...parts, minute: dragging }, zone));
  };
  const shown = dragging ?? minute;

  return (
    <div className="card timebar">
      <div className="timebar-row">
        <input type="date" value={zonedIsoDate(parts)} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
        <output>{dragging === null ? clockLabel(instant, zone) : `${pad(Math.floor(shown / 60))}:${pad(shown % 60)}`}</output>
        <label className="check" title={canLocal || local ? undefined : "Add a place to use local time"}>
          <input
            type="checkbox"
            checked={local}
            disabled={!canLocal && !local}
            onChange={(e) => onLocalChange(e.target.checked)}
          />
          Local time
        </label>
        <div className="steps">
          <button onClick={() => step(-DAY)}>−1d</button>
          <button onClick={() => step(-HOUR)}>−1h</button>
          <button onClick={() => step(HOUR)}>+1h</button>
          <button onClick={() => step(DAY)}>+1d</button>
          <button onClick={() => onChange(new Date(Math.floor(Date.now() / (5 * MINUTE_MS)) * 5 * MINUTE_MS))}>Now</button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={24 * 60 - SLIDER_STEP}
        step={SLIDER_STEP}
        value={shown}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Time of day"
      />
      <div className="ticks" aria-hidden>
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h}>{pad(h)}</span>
        ))}
      </div>
      {caption && <p className="muted">{caption}</p>}
    </div>
  );
}
