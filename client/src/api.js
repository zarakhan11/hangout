async function req(url, opts) {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export const createHangout = (body) =>
  req("/api/hangouts", { method: "POST", body: JSON.stringify(body) });

export const getHangout = (id) => req(`/api/hangouts/${id}`);

export const respond = (id, body) =>
  req(`/api/hangouts/${id}/respond`, { method: "POST", body: JSON.stringify(body) });

export const decideNow = (id, creatorKey) =>
  req(`/api/hangouts/${id}/decide`, { method: "POST", body: JSON.stringify({ creatorKey }) });

export const cancelHangout = (id, creatorKey) =>
  req(`/api/hangouts/${id}/cancel`, { method: "POST", body: JSON.stringify({ creatorKey }) });

export const editHangout = (id, body) =>
  req(`/api/hangouts/${id}/edit`, { method: "POST", body: JSON.stringify(body) });

export const getIdeas = (id) => req(`/api/hangouts/${id}/ideas`);

export const calendarUrl = (id) => `/api/hangouts/${id}/calendar.ics`;

// --- tiny local persistence for "who am I" per hangout ---
export const remember = (id, data) =>
  localStorage.setItem(`hangout:${id}`, JSON.stringify(data));
export const recall = (id) => {
  try {
    return JSON.parse(localStorage.getItem(`hangout:${id}`)) || {};
  } catch {
    return {};
  }
};

export const BLOCKS = [
  { key: "morning", label: "Morning", emoji: "🌅", hint: "9am–12pm" },
  { key: "afternoon", label: "Afternoon", emoji: "☀️", hint: "12–5pm" },
  { key: "evening", label: "Evening", emoji: "🌆", hint: "5–9pm" },
  { key: "night", label: "Night", emoji: "🌙", hint: "9pm+" },
];

export const VIBES = [
  { key: "food", label: "Food", emoji: "🍜" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "movies", label: "Movies", emoji: "🎬" },
  { key: "games", label: "Games", emoji: "🎮" },
  { key: "outdoors", label: "Outdoors", emoji: "🌲" },
  { key: "sports", label: "Sports", emoji: "🏀" },
  { key: "shopping", label: "Shopping", emoji: "🛍️" },
  { key: "music", label: "Music", emoji: "🎶" },
  { key: "chill", label: "Chill", emoji: "🛋️" },
  { key: "adventure", label: "Adventure", emoji: "🧭" },
  { key: "art", label: "Art", emoji: "🎨" },
  { key: "study", label: "Study", emoji: "📚" },
];

export function fmtDay(iso, opts = {}) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: opts.long ? "long" : "short",
    month: "short",
    day: "numeric",
  });
}

export function blockInfo(key) {
  return BLOCKS.find((b) => b.key === key) || { label: key, emoji: "🕐", hint: "" };
}
