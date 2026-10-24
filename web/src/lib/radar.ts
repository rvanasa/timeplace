import { HOUR, MINUTE_MS, floorHour, pad, ymd } from "./fmt";

const IEM = "https://mesonet.agron.iastate.edu/c/tile.py/1.0.0";
const MAX_FORECAST_MINUTES = 18 * 60;

/** IEM radar mosaic tiles: observed composite for the past, HRRR reflectivity ahead of now. */
export function radarTileUrl(t: Date, now: Date): string | null {
  const ahead = t.getTime() - now.getTime();
  if (ahead < -5 * MINUTE_MS) {
    const five = new Date(Math.floor(t.getTime() / (5 * MINUTE_MS)) * 5 * MINUTE_MS);
    return `${IEM}/ridge::USCOMP-N0Q-${ymd(five)}${pad(five.getUTCHours())}${pad(five.getUTCMinutes())}/{z}/{x}/{y}.png`;
  }
  if (ahead <= 5 * MINUTE_MS) return `${IEM}/ridge::USCOMP-N0Q-0/{z}/{x}/{y}.png`;
  // Latest HRRR run that is reliably published.
  const run = floorHour(new Date(now.getTime() - HOUR));
  const minutes = Math.round((t.getTime() - run.getTime()) / (15 * MINUTE_MS)) * 15;
  if (minutes > MAX_FORECAST_MINUTES) return null;
  return `${IEM}/hrrr::REFD-F${String(minutes).padStart(4, "0")}-${ymd(run)}${pad(run.getUTCHours())}/{z}/{x}/{y}.png`;
}
