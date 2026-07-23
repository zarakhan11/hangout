import { useState } from "react";

// Nearby spots via OpenStreetMap's Overpass API — free, no key, no account.
// Results are real places around the user's location.

export const CATS = [
  { key: "food", label: "🍜 Food", q: '["amenity"~"restaurant|fast_food|food_court"]' },
  { key: "coffee", label: "☕ Coffee", q: '["amenity"~"cafe|ice_cream|juice_bar"]' },
  { key: "fun", label: "🎳 Fun", q: '["leisure"~"bowling_alley|amusement_arcade|escape_game|miniature_golf|park|trampoline_park"]' },
  { key: "shops", label: "🛍️ Shops", q: '["shop"~"second_hand|charity|clothes|vintage|books|gift|mall|department_store"]' },
];

export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no geo"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => reject(new Error("denied")),
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}

export async function fetchNearby(cat, lat, lon) {
  const radius = 4000; // ~2.5 miles
  const query = `[out:json][timeout:15];(node${cat.q}(around:${radius},${lat},${lon});way${cat.q}(around:${radius},${lat},${lon}););out center tags 40;`;
  const MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  let data = null;
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query) });
      if (res.ok) { data = await res.json(); break; }
    } catch { /* try next mirror */ }
  }
  if (!data) throw new Error("lookup failed");
  const seen = new Set();
  return (data.elements || [])
    .map((el) => {
      const t = el.tags || {};
      const latlon = el.center || el;
      return {
        name: t.name,
        cuisine: (t.cuisine || t.leisure || t.amenity || "").split(";")[0].replace(/_/g, " "),
        // completeness of listing ≈ how established the place is
        score:
          (t.name ? 1 : 0) + (t.cuisine ? 1 : 0) + (t.website || t["contact:website"] ? 2 : 0) +
          (t.opening_hours ? 2 : 0) + (t.phone || t["contact:phone"] ? 1 : 0) + (t.brand ? -1 : 0),
        maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.name || "")}&query_place_id=&center=${latlon.lat},${latlon.lon}`,
      };
    })
    .filter((p) => p.name && !seen.has(p.name) && seen.add(p.name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export default function Nearby({ onPick }) {
  const [cat, setCat] = useState(CATS[0]);
  const [spots, setSpots] = useState(null);
  const [state, setState] = useState("idle"); // idle | locating | loading | done | error
  const [coords, setCoords] = useState(null);

  const locate = () =>
    new Promise((resolve, reject) => {
      if (coords) return resolve(coords);
      if (!navigator.geolocation) return reject(new Error("no geo"));
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setCoords(c);
          resolve(c);
        },
        () => reject(new Error("denied")),
        { timeout: 10000, maximumAge: 300000 }
      );
    });

  const load = async (c = cat) => {
    setState("locating");
    try {
      const { lat, lon } = await locate();
      setState("loading");
      setSpots(await fetchNearby(c, lat, lon));
      setState("done");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="card">
      <h3>📍 Good spots near you</h3>
      {state === "idle" && (
        <>
          <p className="muted">Find real restaurants, cafés, and activities around you — no account needed.</p>
          <button className="btn primary" onClick={() => load()}>Use my location</button>
        </>
      )}
      {(state === "locating" || state === "loading") && <div className="spinner small" />}
      {state === "error" && (
        <>
          <p className="muted">Couldn't get your location — check that location access is allowed for your browser.</p>
          <button className="btn ghost" onClick={() => load()}>Try again</button>
        </>
      )}
      {state === "done" && (
        <>
          <div className="nearby-tabs">
            {CATS.map((c) => (
              <button
                key={c.key}
                className={`chip tag ${cat.key === c.key ? "on" : ""}`}
                onClick={() => { setCat(c); load(c); }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="nearby-list">
            {spots?.length === 0 && <p className="muted">Nothing found in this category near you — try another tab.</p>}
            {spots?.map((s) => (
              <div className="spot" key={s.name}>
                <div className="s-info">
                  <b>{s.name}</b>
                  {s.cuisine && <small>{s.cuisine}</small>}
                </div>
                {onPick ? (
                  <button className="btn small" onClick={() => onPick(s.name)}>+ Add</button>
                ) : (
                  <a className="btn small" href={s.maps} target="_blank" rel="noreferrer">Map</a>
                )}
              </div>
            ))}
          </div>
          <small className="muted tiny">Live data from OpenStreetMap contributors.</small>
        </>
      )}
    </div>
  );
}
