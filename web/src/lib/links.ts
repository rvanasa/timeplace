import { DAY, HOUR, floorHour, isoDate, localMdy, pad, shift, ymd, yymmdd } from "./fmt";
import { reportsPageUrl } from "./wx";

export interface LinkContext {
  lat: number;
  lon: number;
  instant: Date;
  timeZone: string;
  /** Two-letter US state, used for the `#XXwx` hashtag search. */
  state: string | null;
  now: Date;
}

export interface ExternalLink {
  label: string;
  href: string;
  scope?: string;
}

const iso = (d: Date) => `${isoDate(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;

/** Links that make sense for the moment: archives need the event to have started, live views need it to be recent. */
export function externalLinks(c: LinkContext): ExternalLink[] {
  const { lat, lon, instant: t, now } = c;
  const started = t.getTime() <= now.getTime();
  const past = t.getTime() < now.getTime() - HOUR;
  const recent = t.getTime() <= now.getTime() + HOUR && t.getTime() >= now.getTime() - 2 * DAY;
  const live = Math.abs(t.getTime() - now.getTime()) <= HOUR;
  const h = floorHour(t);
  const links: ExternalLink[] = [];

  if (started && c.state) {
    links.push({
      label: "Search X",
      scope: `#${c.state}wx`,
      href: `https://x.com/search?q=%28%23${c.state}wx%29+since%3A${isoDate(shift(t, -14 * HOUR))}+until%3A${isoDate(shift(t, DAY + 14 * HOUR))}`,
    });
  }
  links.push({
    label: "Mesoview",
    scope: "500 mb · 3CVR",
    href: `https://mesoview.app?location=${lat},${lon}&param=500mb+3cvr${past ? `&time=${isoDate(h)}+${pad(h.getUTCHours())}z` : ""}`,
  });
  if (started) {
    links.push({
      label: "SPC archive",
      scope: "event day",
      href: `https://www.spc.noaa.gov/exper/archive/event.php?date=${ymd(shift(t, -12 * HOUR))}`,
    });
    links.push({ label: "Storm reports", scope: "regional", href: reportsPageUrl(t) });
    links.push({ label: "Chase Archive", scope: "local date", href: `https://app.chasearchive.com/?q=${localMdy(t, c.timeZone)}` });
  }
  if (t.getUTCFullYear() < now.getUTCFullYear()) {
    links.push({
      label: "Tornado Archive",
      scope: "±6 h",
      href: `https://tornadoarchive.com/explorer/#interval=${iso(shift(t, -6 * HOUR))};${iso(shift(t, 6 * HOUR))}&map=${lon};${lat};6&env_src=era5&env_type=hodocape`,
    });
  }
  if (past) {
    const sounding = shift(h, -(h.getUTCHours() % 12) * HOUR);
    links.push({
      label: "SPC soundings",
      scope: `${pad(sounding.getUTCHours())}z`,
      href: `https://www.spc.noaa.gov/exper/soundings/${yymmdd(sounding)}${pad(sounding.getUTCHours())}_OBS/`,
    });
  }
  if (!past) {
    links.push({
      label: "Pivotal Weather",
      scope: "HRRR",
      href: `https://www.pivotalweather.com/model.php?rh=${ymd(h)}${pad(h.getUTCHours())}&fh=loop&r=us_c&p=sbcape_hodo&m=hrrr`,
    });
  }
  if (recent) {
    links.push({ label: "Zoom Earth", scope: "satellite", href: `https://zoom.earth/maps/satellite/#view=${lat},${lon},7z` });
  }
  if (live) {
    links.push({
      label: "College of DuPage",
      scope: "regional",
      href: "https://weather.cod.edu/satrad/?parms=regional-central-truecolor-200-0-100-1",
    });
  }
  links.push({
    label: "Google Maps",
    scope: "satellite",
    href: `https://www.google.com/maps/@?api=1&map_action=map&center=${lat},${lon}&zoom=12&basemap=satellite`,
  });
  return links;
}
