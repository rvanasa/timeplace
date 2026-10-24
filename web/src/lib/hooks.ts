import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useJson<T>(url: string | null): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    setData(null);
    if (!url) return;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .then(setData)
      .catch(() => undefined);
    return () => controller.abort();
  }, [url]);
  return data;
}

const stateCache = new Map<string, string | null>();

/** US state abbreviation for a point via Nominatim reverse geocoding. */
export function useStateLabel(lat: number | null, lon: number | null): string | null {
  const key = lat === null || lon === null ? null : `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const settled = useDebounced(key, 1000);
  const [state, setState] = useState<string | null>(null);

  useEffect(() => {
    if (!settled) return setState(null);
    const cached = stateCache.get(settled);
    if (cached !== undefined) return setState(cached);
    const [la, lo] = settled.split(",");
    const controller = new AbortController();
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&addressdetails=1&lat=${la}&lon=${lo}`,
      { signal: controller.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { address?: Record<string, string> } | null) => {
        const iso = data?.address?.["ISO3166-2-lvl4"];
        const value = iso?.startsWith("US-") ? iso.slice(3) : null;
        stateCache.set(settled, value);
        setState(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [settled]);

  return key === null ? null : state;
}
