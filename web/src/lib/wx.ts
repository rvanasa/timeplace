import { DAY, HOUR, floorHour, pad, shift, ymd, yymmdd } from "./fmt";

const MESO = "https://www.spc.noaa.gov/exper/mesoanalysis";

export const MESO_SECTORS: { id: number; name: string; lat: number; lon: number }[] = [
  { id: 19, name: "Continental U.S.", lat: 38, lon: -97 },
  { id: 11, name: "Northwest", lat: 45, lon: -118 },
  { id: 12, name: "Southwest", lat: 35, lon: -116 },
  { id: 13, name: "Northern Plains", lat: 46, lon: -100 },
  { id: 14, name: "Central Plains", lat: 39, lon: -98 },
  { id: 15, name: "Southern Plains", lat: 33, lon: -98 },
  { id: 16, name: "Northeast", lat: 42, lon: -74 },
  { id: 18, name: "Southeast", lat: 33, lon: -84 },
  { id: 17, name: "Atlantic", lat: 34, lon: -74 },
  { id: 20, name: "Midwest", lat: 41, lon: -90 },
  { id: 21, name: "Great Lakes", lat: 44, lon: -85 },
  { id: 22, name: "Mountain West", lat: 40, lon: -110 },
];

export const MESO_PARAMS: [string, string][] = [
  ["300mb", "300 mb"],
  ["500mb", "500 mb"],
  ["700mb", "700 mb"],
  ["850mb", "850 mb"],
  ["ageo", "300 mb jet circulation"],
  ["pmsl", "MSL pressure / wind"],
  ["ttd", "Temp / dewpoint / wind"],
  ["scp", "Supercell composite"],
  ["3cvr", "Sfc vorticity / 3CAPE"],
  ["stor", "Sig tornado (fixed layer)"],
  ["stpc", "Sig tornado (effective layer)"],
  ["stpc5", "Sig tornado (0-500m SRH)"],
  ["dvvr", "Sfc convergence & vorticity"],
  ["lr3c", "0-3km lapse rate & ML3CAPE"],
  ["lclh", "LCL height"],
  ["nstp", "Non-supercell tornado"],
  ["effh", "Eff. inflow base + ESRH"],
  ["srh5", "Eff. inflow base + 0-500m SRH"],
  ["mlcp", "MLCAPE / MLCIN"],
  ["hail", "Hail parameters"],
  ["mbcp", "Microburst composite"],
  ["vadv", "Vorticity advection"],
  ["ddrh", "Dendritic growth layer"],
  ["snsq", "Snow squall"],
  ["oprh", "OPRH"],
];

export function nearestSector(lat: number, lon: number): number {
  const candidates = MESO_SECTORS.filter((s) => s.id !== 19 && s.id !== 17);
  let best = 19;
  let bestDist = 22; // degrees; beyond this, fall back to the CONUS sector
  for (const s of candidates) {
    const d = Math.hypot(s.lat - lat, (s.lon - lon) * Math.cos((lat * Math.PI) / 180));
    if (d < bestDist) [best, bestDist] = [s.id, d];
  }
  return best;
}

/** SPC mesoanalysis only archives up to six hours ahead of now. */
export function mesoAvailable(t: Date, now: Date): boolean {
  return floorHour(t).getTime() - floorHour(now).getTime() <= 6 * HOUR;
}

function hoursFromNow(t: Date, now: Date): number {
  return Math.round((floorHour(t).getTime() - now.getTime()) / HOUR);
}

export function mesoUrl(t: Date, sector: number, param: string, now: Date): string {
  const h = floorHour(t);
  const d = hoursFromNow(t, now);
  const s = `s${sector}`;
  if (d === 0) return `${MESO}/${s}/${param}/${param}.gif`;
  if (d > 0) return `${MESO}/fcst/${s}/${param}_${pad(h.getUTCHours())}_trans.gif`;
  return `${MESO}/${s}/${param}/${param}_${yymmdd(h)}${pad(h.getUTCHours())}.gif`;
}

export function mesoRadarUrl(t: Date, sector: number, now: Date): string {
  const h = floorHour(t);
  const d = hoursFromNow(t, now);
  const s = `s${sector}`;
  if (d === 0) return `${MESO}/${s}/rgnlrad/rgnlrad.gif`;
  if (d > 0) return `${MESO}/fcst/${s}/hrrr_${pad(h.getUTCHours())}.gif`;
  return `${MESO}/${s}/rgnlrad/rad_${ymd(h)}_${pad(h.getUTCHours())}00.gif`;
}

export const mesoBaseLayers = (sector: number): string[] =>
  ["cnty", "hiway"].map((l) => `${MESO}/s${sector}/${l}/${l}.gif`);

export const SURFACE_DISPLAYS: [string, string][] = [
  ["namussfc", "Default"],
  ["ussatsfc", "Satellite"],
  ["radsfcus_exp", "Radar"],
];

export function surfaceUrl(t: Date, display: string, now: Date): string {
  const h = floorHour(t);
  if (h.getTime() >= floorHour(now).getTime()) return `https://www.wpc.ncep.noaa.gov/sfc/${display}wbg.gif`;
  const analysis = shift(h, -(h.getUTCHours() % 3) * HOUR);
  return `https://www.wpc.ncep.noaa.gov/archives/sfc/${analysis.getUTCFullYear()}/${display}${ymd(analysis)}${pad(analysis.getUTCHours())}.gif`;
}

export function nationalForecastUrl(t: Date, now: Date): string {
  const h = floorHour(t);
  if (h.getTime() >= floorHour(now).getTime()) return "https://www.wpc.ncep.noaa.gov/noaa/noaad1.gif";
  const run = shift(h, -(12 + (h.getUTCHours() % 12)) * HOUR);
  return `https://www.wpc.ncep.noaa.gov/archives/noaa/${run.getUTCFullYear()}/noaad1_${ymd(run)}${pad(run.getUTCHours())}.gif`;
}

const ISSUANCES: Record<number, [number, number][]> = {
  1: [[1, 0], [6, 0], [13, 0], [16, 30], [20, 0]],
  2: [[6, 0], [17, 30]],
  3: [[7, 30], [19, 30]],
};

export interface Outlook {
  categorical: string;
  probabilities: [string, string][];
  issued: Date;
}

/** Latest SPC convective outlook of the given day (1-3) issued at or before the event time. */
export function outlookFor(day: 1 | 2 | 3, t: Date): Outlook {
  const ref = shift(t, -(day - 1) * DAY);
  let issued = new Date(0);
  for (const dayOffset of [0, -1]) {
    for (const [hh, mm] of ISSUANCES[day]!) {
      const c = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + dayOffset, hh, mm));
      if (c <= ref && c > issued) issued = c;
    }
  }
  const prefix = `https://www.spc.noaa.gov/products/outlook/archive/${issued.getUTCFullYear()}/day${day}`;
  const middle = `${ymd(issued)}_${pad(issued.getUTCHours())}${pad(issued.getUTCMinutes())}`;
  const prob = (kind: string) => `${prefix}probotlk_${middle}_${kind}_prt.gif`;
  return {
    categorical: `${prefix}otlk_${middle}.gif`,
    probabilities:
      day < 3
        ? [["Tornado", prob("torn")], ["Wind", prob("wind")], ["Hail", prob("hail")]]
        : [["Any severe", prob("any")]],
    issued,
  };
}

/** SPC storm report day runs 12z to 12z, keyed by the starting date. */
export function reportDate(t: Date): string {
  return yymmdd(shift(floorHour(t), -12 * HOUR));
}

export const reportsImageUrl = (t: Date): string =>
  `https://www.spc.noaa.gov/climo/reports/${reportDate(t)}_rpts.gif`;

export const reportsPageUrl = (t: Date): string =>
  `https://www.spc.noaa.gov/climo/reports/${reportDate(t)}_rpts.html`;
