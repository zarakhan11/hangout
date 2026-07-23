// Local profile: who you are across all hangouts on this device.
// Google sign-in (optional) fills the same profile shape.

const KEY = "hangout:profile";
const HIST = "hangout:history";

function makeToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

export function getProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && !p.token) {
      p.token = makeToken();
      localStorage.setItem(KEY, JSON.stringify(p));
    }
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(p) {
  localStorage.setItem(KEY, JSON.stringify({ token: makeToken(), ...p }));
}

export function clearProfile() {
  localStorage.removeItem(KEY);
}

/* ---------- my hangouts history ---------- */

export function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HIST)) || [];
  } catch {
    return [];
  }
}

export function recordHangout({ id, title, role }) {
  const hist = getHistory().filter((h) => h.id !== id);
  hist.unshift({ id, title, role, at: Date.now() });
  localStorage.setItem(HIST, JSON.stringify(hist.slice(0, 20)));
}
