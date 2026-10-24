import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { GeoJsonObject } from "geojson";
import { MINUTE_MS, stamp } from "../lib/fmt";
import { useDebounced, useJson } from "../lib/hooks";
import { radarTileUrl } from "../lib/radar";

interface Props {
  lat: number | null;
  lon: number | null;
  instant: Date;
  onMove: (lat: number, lon: number) => void;
}

const pin = L.divIcon({ className: "pin", iconSize: [18, 18], iconAnchor: [9, 9] });

const WARNING_COLORS: Record<string, string> = { TO: "#e5242b", SV: "#f2b705", EW: "#d12bd1", FF: "#2ba84a", MA: "#2b7bd1" };
const REPORT_COLORS: Record<string, string> = { TORNADO: "#e5242b", "FUNNEL CLOUD": "#e5242b", HAIL: "#2b7bd1", "TSTM WND GST": "#f2b705", "TSTM WND DMG": "#f2b705" };

const isDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function Interactions({ lat, lon, onMove }: Pick<Props, "lat" | "lon" | "onMove">) {
  const map = useMap();
  useMapEvents({ click: (e) => onMove(e.latlng.lat, e.latlng.lng) });
  useEffect(() => {
    if (lat === null || lon === null) return;
    if (!map.getBounds().contains([lat, lon])) map.setView([lat, lon], Math.max(map.getZoom(), 7));
  }, [lat, lon, map]);
  return null;
}

type Collection = GeoJsonObject & { features: { properties: Record<string, unknown> }[] };

export default function MapView({ lat, lon, instant, onMove }: Props) {
  const [layers, setLayers] = useState({ radar: true, warnings: true, reports: true });
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDark(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const when = useDebounced(instant, 250);
  const window30 = (minutes: number) =>
    `sts=${stamp(new Date(when.getTime() - minutes * MINUTE_MS))}&ets=${stamp(new Date(when.getTime() + minutes * MINUTE_MS))}`;
  const warnings = useJson<Collection>(
    layers.warnings ? `https://mesonet.agron.iastate.edu/geojson/sbw.php?${window30(30)}` : null,
  );
  const reports = useJson<Collection>(
    layers.reports ? `https://mesonet.agron.iastate.edu/geojson/lsr.php?${window30(60)}` : null,
  );

  const radar = useMemo(() => radarTileUrl(when, new Date()), [when]);
  const position: [number, number] | null = lat !== null && lon !== null ? [lat, lon] : null;

  return (
    <div className="map">
      <MapContainer center={position ?? [39, -98]} zoom={position ? 8 : 4} zoomControl={false} worldCopyJump>
        <TileLayer
          key={dark ? "dark" : "light"}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={`https://{s}.basemaps.cartocdn.com/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png`}
        />
        {layers.radar && radar && <TileLayer key={radar} url={radar} opacity={0.65} zIndex={5} />}
        {warnings && (
          <GeoJSON
            key={`w-${when.getTime()}-${warnings.features.length}`}
            data={warnings}
            style={(f) => {
              const color = WARNING_COLORS[String(f?.properties?.phenomena)] ?? "#888";
              return { color, weight: 2, fillOpacity: 0.08 };
            }}
            onEachFeature={(f, layer) => {
              const p = f.properties as Record<string, string>;
              layer.bindTooltip(`${p.ps ?? p.phenomena} ${p.significance ?? ""}`.trim(), { sticky: true });
            }}
          />
        )}
        {reports && (
          <GeoJSON
            key={`r-${when.getTime()}-${reports.features.length}`}
            data={reports}
            pointToLayer={(f, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                weight: 1,
                color: "#fff",
                fillOpacity: 0.95,
                fillColor: REPORT_COLORS[String((f.properties as Record<string, unknown>).typetext).toUpperCase()] ?? "#8a8a8a",
              })
            }
            onEachFeature={(f, layer) => {
              const p = f.properties as Record<string, string>;
              layer.bindTooltip(`${p.typetext}${p.magnitude ? ` ${p.magnitude}` : ""} · ${p.city ?? ""}`, { sticky: true });
            }}
          />
        )}
        <Interactions lat={lat} lon={lon} onMove={onMove} />
        {position && (
          <Marker
            position={position}
            icon={pin}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onMove(ll.lat, ll.lng);
              },
            }}
          />
        )}
      </MapContainer>
      <div className="layers">
        {(["radar", "warnings", "reports"] as const).map((key) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={layers[key]}
              onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
            />
            {key}
          </label>
        ))}
      </div>
    </div>
  );
}
