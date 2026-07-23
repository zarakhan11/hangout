import { useState } from "react";

// Nearby spots via OpenStreetMap's Overpass API — free, no key, no account.
// Results are real places around the user's location.

export const CATS = [
  { key: "food", label: "🍜 Food", qs: ['["amenity"~"restaurant|fast_food|food_court"]'] },
  { key: "coffee", label: "☕ Cafés", qs: ['["amenity"~"cafe|ice_cream|juice_bar"]', '["shop"~"bakery|coffee|confectionery|chocolate"]'] },
  { key: "fun", label: "🎬 Fun", qs: ['["leisure"~"bowling_alley|amusement_arcade|escape_game|miniature_golf|trampoline_park|ice_rink|water_park"]', '["amenity"~"cinema|theatre"]', '["tourism"~"attraction|theme_park|zoo|aquarium"]'] },
  { key: "culture", label: "🎨 Culture", qs: ['["tourism"~"museum|gallery"]', '["amenity"~"arts_centre|library"]'] },
  { key: "outdoors", label: "🌳 Outdoors", qs: ['["leisure"~"park|garden|nature_reserve|dog_park"]', '["natural"~"beach"]', '["tourism"~"viewpoint|picnic_site"]'] },
  { key: "sports", label: "🏀 Sports", qs: ['["leisure"~"fitness_centre|sports_centre|swimming_pool|climbing|skate_park|golf_course"]'] },
  { key: "shops", label: "🛍️ Shops", qs: ['["shop"~"second_hand|charity|clothes|vintage|books|gift|mall|department_store|music|games|toys|jewelry|shoes|cosmetics|stationery|anime"]'] },
  { key: "night", label: "🎤 Night", qs: ['["amenity"~"karaoke_box|music_venue|bar|pub|nightclub"]'] },
];

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function overpass(query) {
  for (const url of MIRRORS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query) });
      if (res.ok) return await res.json();
    } catch { /* try next mirror */ }
  }
  throw new Error("lookup failed");
}

function parseElements(elements) {
  const seen = new Set();
  return (elements || [])
    .map((el) => {
      const t = el.tags || {};
      const latlon = el.center || el;
      const kind = (t.cuisine || t.shop || t.leisure || t.amenity || t.tourism || t.natural || "")
        .split(";")[0]
        .replace(/_/g, " ");
      return {
        name: t.name,
        cuisine: kind,
        kind,
        score:
          (t.name ? 1 : 0) + (t.cuisine || t.shop ? 1 : 0) + (t.website || t["contact:website"] ? 2 : 0) +
          (t.opening_hours ? 2 : 0) + (t.phone || t["contact:phone"] ? 1 : 0) + (t.brand ? -1 : 0),
        maps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.name || "")}&query_place_id=&center=${latlon.lat},${latlon.lon}`,
      };
    })
    .filter((p) => p.name && !seen.has(p.name) && seen.add(p.name))
    .sort((a, b) => b.score - a.score);
}

export async function fetchNearby(cat, lat, lon) {
  const radius = 4000; // ~2.5 miles
  const clauses = cat.qs
    .map((q) => `node${q}(around:${radius},${lat},${lon});way${q}(around:${radius},${lat},${lon});`)
    .join("");
  const data = await overpass(`[out:json][timeout:15];(${clauses});out center tags 50;`);
  return parseElements(data.elements).slice(0, 6);
}

// One combined scan across EVERY category — used by JAX's local intel
export async function fetchAllNearby(lat, lon) {
  const radius = 4000;
  const clauses = CATS.flatMap((c) =>
    c.qs.map((q) => `node${q}(around:${radius},${lat},${lon});way${q}(around:${radius},${lat},${lon});`)
  ).join("");
  const data = await overpass(`[out:json][timeout:20];(${clauses});out center tags 120;`);
  return parseElements(data.elements).slice(0, 40).map((p) => ({ name: p.name, kind: p.kind }));
}

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

export default function Nearby({ onPick }) {
  const [cat, setCat] = useState(CATS[0]);
  const [spots, setSpots] = useState(null);
  const [state, setState] = useState("idle"); // idle | locating | loading | done | error
  const [coords, setCoords] = useState(null);

  const locate = async () => {
    if (coords) return coords;
    const c = await getLocation();
    setCoords(c);
    return c;
  };

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
          <p className="muted">Find real restaurants, cafés, activities, shops, and more around you — no account needed.</p>
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
