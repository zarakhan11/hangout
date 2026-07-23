import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";
import db from "./db.js";
import { getIdeas, assistant, VIBES } from "./ideas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ---------- Stripe webhook (must see the RAW body, so it's registered
   before the JSON parser) ---------- */

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE = process.env.STRIPE_PRICE_ID || "";
const STRIPE_WH_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const paymentsEnabled = () => Boolean(STRIPE_KEY && STRIPE_PRICE);

function verifyStripeSig(rawBody, sigHeader) {
  if (!STRIPE_WH_SECRET) return true; // not configured → accept (dev mode)
  try {
    const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=")));
    const expected = crypto
      .createHmac("sha256", STRIPE_WH_SECRET)
      .update(`${parts.t}.${rawBody}`)
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1 || ""));
  } catch {
    return false;
  }
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const raw = req.body.toString("utf8");
  if (!verifyStripeSig(raw, req.headers["stripe-signature"] || "")) {
    return res.status(400).send("bad signature");
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).send("bad payload");
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.client_reference_id) {
      db.prepare(
        "INSERT OR REPLACE INTO premium_tokens (token, code_used, stripe_customer, stripe_sub) VALUES (?, 'stripe', ?, ?)"
      ).run(s.client_reference_id, s.customer || null, s.subscription || null);
    }
  }
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    db.prepare("DELETE FROM premium_tokens WHERE stripe_sub = ?").run(sub.id);
  }
  res.json({ received: true });
});

app.use(express.json({ limit: "3mb" })); // memory photos come in as base64

const PORT = process.env.PORT || 3000;
const BLOCK_ORDER = ["morning", "afternoon", "evening", "night"];

// ---------- helpers ----------

function getHangout(id) {
  const h = db.prepare("SELECT * FROM hangouts WHERE id = ?").get(id);
  if (!h) return null;
  const responses = db
    .prepare("SELECT name, slots, place_vote, interests, avatar, client_token, bailed, created_at FROM responses WHERE hangout_id = ? ORDER BY id")
    .all(id);
  return {
    id: h.id,
    title: h.title,
    creator: h.creator,
    note: h.note,
    squadId: h.squad_id || null,
    surprise: Boolean(h.surprise),
    revealed: Boolean(h.revealed),
    days: JSON.parse(h.days),
    blocks: JSON.parse(h.blocks),
    places: JSON.parse(h.places),
    expected: h.expected,
    decidedSlot: h.decided_slot,
    decidedPlace: h.decided_place,
    decidedAt: h.decided_at,
    canceledAt: h.canceled_at,
    createdAt: h.created_at,
    responses: responses.map((r) => ({
      name: r.name,
      slots: JSON.parse(r.slots),
      placeVote: r.place_vote,
      interests: JSON.parse(r.interests || "[]"),
      avatar: r.avatar || "",
      bailed: Boolean(r.bailed),
    })),
  };
}

function decide(hangout) {
  // Count availability per slot
  const counts = new Map();
  for (const r of hangout.responses) {
    for (const slot of r.slots) counts.set(slot, (counts.get(slot) || 0) + 1);
  }
  if (counts.size === 0) return null;

  // Best slot: most people, then earliest date, then earliest block
  const best = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const [dateA, blockA] = a[0].split("|");
    const [dateB, blockB] = b[0].split("|");
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    return BLOCK_ORDER.indexOf(blockA) - BLOCK_ORDER.indexOf(blockB);
  })[0][0];

  // Best place: most votes, ties → order listed
  let place = null;
  if (hangout.places.length > 0) {
    const placeCounts = new Map(hangout.places.map((p) => [p, 0]));
    for (const r of hangout.responses) {
      if (r.placeVote && placeCounts.has(r.placeVote)) {
        placeCounts.set(r.placeVote, placeCounts.get(r.placeVote) + 1);
      }
    }
    place = [...placeCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return { slot: best, place };
}

function maybeAutoDecide(id) {
  const h = getHangout(id);
  if (!h || h.decidedSlot) return h;
  if (h.expected > 0 && h.responses.length >= h.expected) {
    const result = decide(h);
    if (result) {
      db.prepare(
        "UPDATE hangouts SET decided_slot = ?, decided_place = ?, decided_at = datetime('now') WHERE id = ?"
      ).run(result.slot, result.place, id);
    }
  }
  return getHangout(id);
}

// ---------- auth ----------

function hashPass(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function checkPass(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

function userFromToken(token) {
  if (!token) return null;
  const s = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token);
  if (!s) return null;
  return db.prepare("SELECT id, email, name, seed, vibes FROM users WHERE id = ?").get(s.user_id) || null;
}

// For metering/dedupe: a logged-in session maps to the stable user id,
// so premium + limits follow the account across devices.
function resolveToken(rawToken) {
  const u = userFromToken(rawToken);
  return u ? `user:${u.id}` : String(rawToken || "").slice(0, 40);
}

function publicUser(u) {
  return { name: u.name, email: u.email, seed: u.seed, vibes: JSON.parse(u.vibes || "[]") };
}

app.post("/api/auth/signup", (req, res) => {
  const { email, password, name, seed, vibes } = req.body || {};
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: "That doesn't look like an email address." });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: "Password needs at least 6 characters." });
  }
  if (!name?.trim()) return res.status(400).json({ error: "Add your name!" });
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(cleanEmail)) {
    return res.status(400).json({ error: "You already have an account — log in instead!" });
  }
  const id = nanoid(10);
  db.prepare("INSERT INTO users (id, email, name, pass, seed, vibes) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    cleanEmail,
    name.trim().slice(0, 40),
    hashPass(String(password)),
    String(seed || "").slice(0, 120),
    JSON.stringify(Array.isArray(vibes) ? vibes.slice(0, 6) : [])
  );
  const token = nanoid(24);
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, id);
  res.json({ token, user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id)) });
});

app.post("/api/auth/login", (req, res) => {
  const cleanEmail = String(req.body?.email || "").trim().toLowerCase();
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(cleanEmail);
  if (!u || !checkPass(String(req.body?.password || ""), u.pass)) {
    return res.status(401).json({ error: "Wrong email or password." });
  }
  const token = nanoid(24);
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, u.id);
  res.json({ token, user: publicUser(u) });
});

app.get("/api/auth/me", (req, res) => {
  const u = userFromToken(String(req.query.token || ""));
  if (!u) return res.status(401).json({ error: "Not logged in." });
  res.json({ user: publicUser(u) });
});

// ---------- API ----------

app.post("/api/hangouts", (req, res) => {
  const { title, creator, note, days, blocks, places, expected, squadId, surprise, clientToken } = req.body || {};
  if (!title?.trim() || !creator?.trim()) {
    return res.status(400).json({ error: "Title and your name are required." });
  }
  if (!Array.isArray(days) || days.length === 0 || days.length > 21) {
    return res.status(400).json({ error: "Pick between 1 and 21 candidate days." });
  }
  if (!Array.isArray(blocks) || blocks.length === 0 || !blocks.every((b) => BLOCK_ORDER.includes(b))) {
    return res.status(400).json({ error: "Pick at least one time of day." });
  }
  const cleanPlaces = Array.isArray(places)
    ? [...new Set(places.map((p) => String(p).trim()).filter(Boolean))].slice(0, 8)
    : [];
  // squad hangouts: only members can create one for the squad
  let cleanSquad = null;
  if (squadId) {
    const u = userFromToken(clientToken);
    const member = u && db.prepare("SELECT 1 FROM squad_members WHERE squad_id = ? AND user_id = ?").get(squadId, u.id);
    if (member) cleanSquad = squadId;
  }

  const id = nanoid(8);
  const creatorKey = nanoid(16);
  db.prepare(
    `INSERT INTO hangouts (id, creator_key, title, creator, note, days, blocks, places, expected, squad_id, surprise)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    creatorKey,
    title.trim().slice(0, 80),
    creator.trim().slice(0, 40),
    (note || "").trim().slice(0, 200),
    JSON.stringify(days),
    JSON.stringify(blocks),
    JSON.stringify(cleanPlaces),
    Math.max(0, Math.min(50, parseInt(expected) || 0)),
    cleanSquad,
    surprise ? 1 : 0
  );
  res.json({ id, creatorKey });
});

app.get("/api/hangouts/:id", (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).json({ error: "Hangout not found." });
  // Surprise mode: hide the destination until the organizer reveals it
  if (h.surprise && !h.revealed && h.decidedSlot) {
    const raw = db.prepare("SELECT creator_key FROM hangouts WHERE id = ?").get(h.id);
    if (req.query.key !== raw.creator_key) {
      return res.json({ ...h, decidedPlace: null, surpriseHidden: true });
    }
  }
  res.json(h);
});

app.post("/api/hangouts/:id/reveal", (req, res) => {
  const raw = db.prepare("SELECT creator_key FROM hangouts WHERE id = ?").get(req.params.id);
  if (!raw) return res.status(404).json({ error: "Hangout not found." });
  if (raw.creator_key !== req.body?.creatorKey) return res.status(403).json({ error: "Only the organizer can reveal." });
  db.prepare("UPDATE hangouts SET revealed = 1 WHERE id = ?").run(req.params.id);
  res.json(getHangout(req.params.id));
});

// "I can't make it anymore" after the plan locked. The flake meter remembers.
app.post("/api/hangouts/:id/bail", (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).json({ error: "Hangout not found." });
  if (!h.decidedSlot) return res.status(400).json({ error: "Plan isn't locked yet. Just update your answer instead." });
  const token = resolveToken(req.body?.clientToken);
  const r = db.prepare("SELECT id FROM responses WHERE hangout_id = ? AND client_token = ?").get(h.id, token);
  if (!r) return res.status(404).json({ error: "You haven't responded to this hangout." });
  db.prepare("UPDATE responses SET bailed = 1 WHERE id = ?").run(r.id);
  res.json(getHangout(h.id));
});

/* ---------- memories ---------- */

app.post("/api/hangouts/:id/memories", (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).json({ error: "Hangout not found." });
  if (!h.decidedSlot) return res.status(400).json({ error: "Memories unlock once the plan is locked." });
  const { photo, caption, name } = req.body || {};
  if (!photo || !String(photo).startsWith("data:image/") || photo.length > 500000) {
    return res.status(400).json({ error: "Photo missing or too large." });
  }
  const count = db.prepare("SELECT COUNT(*) AS c FROM memories WHERE hangout_id = ?").get(h.id).c;
  if (count >= 30) return res.status(400).json({ error: "This hangout's memory wall is full!" });
  db.prepare("INSERT INTO memories (hangout_id, user_name, photo, caption) VALUES (?, ?, ?, ?)").run(
    h.id,
    String(name || "someone").slice(0, 40),
    photo,
    String(caption || "").slice(0, 120)
  );
  res.json({ ok: true });
});

app.get("/api/hangouts/:id/memories", (req, res) => {
  const rows = db
    .prepare("SELECT user_name, photo, caption, created_at FROM memories WHERE hangout_id = ? ORDER BY id DESC")
    .all(req.params.id);
  res.json({ memories: rows });
});

/* ---------- squads ---------- */

app.post("/api/squads", (req, res) => {
  const u = userFromToken(req.body?.token);
  if (!u) return res.status(401).json({ error: "Log in first." });
  const name = String(req.body?.name || "").trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: "Give your squad a name!" });
  const id = nanoid(8);
  db.prepare("INSERT INTO squads (id, name, emoji, owner) VALUES (?, ?, ?, ?)").run(
    id, name, String(req.body?.emoji || "🎈").slice(0, 8), u.id
  );
  db.prepare("INSERT INTO squad_members (squad_id, user_id) VALUES (?, ?)").run(id, u.id);
  res.json({ id });
});

app.get("/api/squads", (req, res) => {
  const u = userFromToken(String(req.query.token || ""));
  if (!u) return res.status(401).json({ error: "Log in first." });
  const squads = db.prepare(`
    SELECT s.id, s.name, s.emoji,
      (SELECT COUNT(*) FROM squad_members m WHERE m.squad_id = s.id) AS members,
      (SELECT COUNT(*) FROM hangouts h WHERE h.squad_id = s.id) AS hangouts
    FROM squads s JOIN squad_members sm ON sm.squad_id = s.id
    WHERE sm.user_id = ? ORDER BY s.created_at DESC
  `).all(u.id);
  res.json({ squads });
});

app.post("/api/squads/:id/join", (req, res) => {
  const u = userFromToken(req.body?.token);
  if (!u) return res.status(401).json({ error: "Log in first." });
  if (!db.prepare("SELECT id FROM squads WHERE id = ?").get(req.params.id)) {
    return res.status(404).json({ error: "Squad not found." });
  }
  db.prepare("INSERT OR IGNORE INTO squad_members (squad_id, user_id) VALUES (?, ?)").run(req.params.id, u.id);
  res.json({ ok: true });
});

app.get("/api/squads/:id", (req, res) => {
  const s = db.prepare("SELECT * FROM squads WHERE id = ?").get(req.params.id);
  if (!s) return res.status(404).json({ error: "Squad not found." });
  const u = userFromToken(String(req.query.token || ""));
  const isMember = u && Boolean(db.prepare("SELECT 1 FROM squad_members WHERE squad_id = ? AND user_id = ?").get(s.id, u.id));

  const members = db.prepare(`
    SELECT us.id, us.name, us.seed FROM squad_members m JOIN users us ON us.id = m.user_id WHERE m.squad_id = ?
  `).all(s.id);

  const hangouts = db.prepare(`
    SELECT id, title, decided_slot, canceled_at,
      (SELECT COUNT(*) FROM memories mm WHERE mm.hangout_id = hangouts.id) AS memory_count
    FROM hangouts WHERE squad_id = ? ORDER BY created_at DESC LIMIT 20
  `).all(s.id);

  // Flake meter: committed = available for the locked slot and didn't bail
  const leaderboard = members.map((m) => {
    const rows = db.prepare(`
      SELECT r.slots, r.bailed, h.decided_slot FROM responses r
      JOIN hangouts h ON h.id = r.hangout_id
      WHERE h.squad_id = ? AND r.client_token = ? AND h.decided_slot IS NOT NULL AND h.canceled_at IS NULL
    `).all(s.id, `user:${m.id}`);
    let committed = 0, flakes = 0;
    for (const r of rows) {
      const available = JSON.parse(r.slots).includes(r.decided_slot);
      if (r.bailed) flakes++;
      else if (available) committed++;
    }
    const total = committed + flakes;
    return {
      name: m.name,
      seed: m.seed,
      committed,
      flakes,
      score: total === 0 ? null : Math.round((committed / total) * 100),
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const memories = db.prepare(`
    SELECT mm.photo, mm.caption, mm.user_name, h.title FROM memories mm
    JOIN hangouts h ON h.id = mm.hangout_id WHERE h.squad_id = ? ORDER BY mm.id DESC LIMIT 12
  `).all(s.id);

  res.json({
    id: s.id, name: s.name, emoji: s.emoji, isMember,
    members, hangouts: hangouts.map((h) => ({
      id: h.id, title: h.title, decidedSlot: h.decided_slot, canceledAt: h.canceled_at, memoryCount: h.memory_count,
    })),
    leaderboard, memories,
  });
});

app.post("/api/hangouts/:id/respond", (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).json({ error: "Hangout not found." });
  if (h.canceledAt) return res.status(400).json({ error: "This hangout was canceled." });
  if (h.decidedSlot) return res.status(400).json({ error: "This hangout is already decided!" });

  const { name, slots, placeVote, interests, avatar, clientToken } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Your name is required." });

  const validSlots = new Set();
  for (const d of h.days) for (const b of h.blocks) validSlots.add(`${d}|${b}`);
  const cleanSlots = Array.isArray(slots) ? [...new Set(slots.filter((s) => validSlots.has(s)))] : [];
  const cleanVote = placeVote && h.places.includes(placeVote) ? placeVote : null;
  const cleanInterests = Array.isArray(interests)
    ? [...new Set(interests.filter((i) => VIBES.includes(i)))].slice(0, 6)
    : [];
  const token = resolveToken(clientToken);

  // Same person (same account/device) updating? Update their row directly.
  const existingMine = token
    ? db.prepare("SELECT id, name FROM responses WHERE hangout_id = ? AND client_token = ?").get(h.id, token)
    : null;

  let finalName = name.trim().slice(0, 40);
  if (existingMine) {
    // keep their row; if they renamed, avoid stealing someone else's name
    if (finalName !== existingMine.name) {
      const clash = db
        .prepare("SELECT id FROM responses WHERE hangout_id = ? AND name = ? AND id != ?")
        .get(h.id, finalName, existingMine.id);
      if (clash) finalName = existingMine.name;
    }
    db.prepare(
      "UPDATE responses SET name = ?, slots = ?, place_vote = ?, interests = ?, avatar = ? WHERE id = ?"
    ).run(finalName, JSON.stringify(cleanSlots), cleanVote, JSON.stringify(cleanInterests), String(avatar || "").slice(0, 120), existingMine.id);
  } else {
    // New device using an already-taken name → auto-suffix (two Sams stay two Sams)
    const taken = (n) =>
      db.prepare("SELECT id FROM responses WHERE hangout_id = ? AND name = ?").get(h.id, n);
    if (taken(finalName)) {
      let i = 2;
      while (taken(`${finalName} ${i}`) && i < 20) i++;
      finalName = `${finalName} ${i}`;
    }
    db.prepare(
      `INSERT INTO responses (hangout_id, name, slots, place_vote, interests, avatar, client_token) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      h.id,
      finalName,
      JSON.stringify(cleanSlots),
      cleanVote,
      JSON.stringify(cleanInterests),
      String(avatar || "").slice(0, 120),
      token
    );
  }

  const updated = maybeAutoDecide(h.id);
  res.json({ ...updated, youAre: finalName });
});

app.post("/api/hangouts/:id/cancel", (req, res) => {
  const raw = db.prepare("SELECT creator_key FROM hangouts WHERE id = ?").get(req.params.id);
  if (!raw) return res.status(404).json({ error: "Hangout not found." });
  if (raw.creator_key !== req.body?.creatorKey) {
    return res.status(403).json({ error: "Only the organizer can cancel." });
  }
  db.prepare("UPDATE hangouts SET canceled_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json(getHangout(req.params.id));
});

app.post("/api/hangouts/:id/edit", (req, res) => {
  const raw = db.prepare("SELECT creator_key FROM hangouts WHERE id = ?").get(req.params.id);
  if (!raw) return res.status(404).json({ error: "Hangout not found." });
  if (raw.creator_key !== req.body?.creatorKey) {
    return res.status(403).json({ error: "Only the organizer can edit." });
  }
  const h = getHangout(req.params.id);
  if (h.decidedSlot) return res.status(400).json({ error: "Can't edit — the plan is already locked." });
  if (h.canceledAt) return res.status(400).json({ error: "Can't edit — this hangout was canceled." });

  const { title, note, days, blocks, places, expected } = req.body || {};
  const newTitle = title?.trim() ? title.trim().slice(0, 80) : h.title;
  const newNote = note != null ? String(note).trim().slice(0, 200) : h.note;
  const newDays = Array.isArray(days) && days.length > 0 && days.length <= 21 ? days : h.days;
  const newBlocks =
    Array.isArray(blocks) && blocks.length > 0 && blocks.every((b) => BLOCK_ORDER.includes(b))
      ? blocks
      : h.blocks;
  const newPlaces = Array.isArray(places)
    ? [...new Set(places.map((p) => String(p).trim()).filter(Boolean))].slice(0, 8)
    : h.places;
  const newExpected = expected != null ? Math.max(0, Math.min(50, parseInt(expected) || 0)) : h.expected;

  db.prepare(
    "UPDATE hangouts SET title = ?, note = ?, days = ?, blocks = ?, places = ?, expected = ? WHERE id = ?"
  ).run(newTitle, newNote, JSON.stringify(newDays), JSON.stringify(newBlocks), JSON.stringify(newPlaces), newExpected, h.id);

  // prune responses that reference removed days/blocks/places
  const valid = new Set();
  for (const d of newDays) for (const b of newBlocks) valid.add(`${d}|${b}`);
  for (const r of db.prepare("SELECT id, slots, place_vote FROM responses WHERE hangout_id = ?").all(h.id)) {
    const slots = JSON.parse(r.slots).filter((s) => valid.has(s));
    const vote = newPlaces.includes(r.place_vote) ? r.place_vote : null;
    db.prepare("UPDATE responses SET slots = ?, place_vote = ? WHERE id = ?").run(JSON.stringify(slots), vote, r.id);
  }

  res.json(maybeAutoDecide(h.id));
});

const BLOCK_TIMES = {
  morning: ["090000", "120000"],
  afternoon: ["120000", "170000"],
  evening: ["170000", "210000"],
  night: ["210000", "235900"],
};

app.get("/api/hangouts/:id/calendar.ics", (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).send("Not found");
  if (!h.decidedSlot) return res.status(400).send("Not decided yet");
  const [date, block] = h.decidedSlot.split("|");
  const d = date.replace(/-/g, "");
  const [start, end] = BLOCK_TIMES[block] || BLOCK_TIMES.evening;
  const esc = (s) => String(s || "").replace(/([,;\\])/g, "\\$1");
  const going = h.responses.filter((r) => r.slots.includes(h.decidedSlot)).map((r) => r.name).join(", ");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hangout//EN",
    "BEGIN:VEVENT",
    `UID:${h.id}@hangout`,
    `DTSTAMP:${d}T000000Z`,
    `DTSTART:${d}T${start}`,
    `DTEND:${d}T${end}`,
    `SUMMARY:${esc(h.title)}`,
    h.decidedPlace ? `LOCATION:${esc(h.decidedPlace)}` : null,
    `DESCRIPTION:${esc(`Locked in via Hangout. Going: ${going}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${h.id}-hangout.ics"`);
  res.send(ics);
});

app.post("/api/hangouts/:id/decide", (req, res) => {
  const raw = db.prepare("SELECT creator_key FROM hangouts WHERE id = ?").get(req.params.id);
  if (!raw) return res.status(404).json({ error: "Hangout not found." });
  if (raw.creator_key !== req.body?.creatorKey) {
    return res.status(403).json({ error: "Only the organizer can decide early." });
  }
  const h = getHangout(req.params.id);
  if (h.decidedSlot) return res.json(h);
  if (h.responses.length === 0) {
    return res.status(400).json({ error: "No one has responded yet — nothing to decide from." });
  }
  const result = decide(h);
  db.prepare(
    "UPDATE hangouts SET decided_slot = ?, decided_place = ?, decided_at = datetime('now') WHERE id = ?"
  ).run(result.slot, result.place, h.id);
  res.json(getHangout(h.id));
});

app.get("/api/hangouts/:id/ideas", async (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).json({ error: "Hangout not found." });
  const result = await getIdeas(h);
  res.json(result);
});

/* ---------- JAX premium ---------- */

// Paywall is OFF by default while testing — everyone gets unlimited JAX.
// To turn monetization on later, set env var JAX_PAYWALL=on (2 free/month, then $3).
const PAYWALL_ON = process.env.JAX_PAYWALL === "on";
const FREE_JAX_QUERIES = 2; // per account per month, when the paywall is on
const premiumCodes = () =>
  (process.env.PREMIUM_CODES || "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

function isPremium(token) {
  return Boolean(db.prepare("SELECT token FROM premium_tokens WHERE token = ?").get(token));
}

function jaxStatus(token) {
  if (!PAYWALL_ON) return { premium: true, remaining: Infinity };
  if (!token) return { premium: false, remaining: 0 };
  if (isPremium(token)) return { premium: true, remaining: Infinity };
  const month = new Date().toISOString().slice(0, 7);
  const row = db.prepare("SELECT count FROM jax_usage WHERE token = ? AND month = ?").get(token, month);
  return { premium: false, remaining: Math.max(0, FREE_JAX_QUERIES - (row?.count || 0)) };
}

app.get("/api/config", (req, res) => {
  res.json({
    paymentLink: process.env.PAYMENT_LINK || null,
    paymentsEnabled: paymentsEnabled(),
    freeJaxQueries: FREE_JAX_QUERIES,
  });
});

// Creates a Stripe Checkout session (Apple Pay / Google Pay / cards built in)
app.post("/api/premium/checkout", async (req, res) => {
  if (!paymentsEnabled()) {
    return res.status(400).json({ error: "Payments aren't set up yet." });
  }
  const token = resolveToken(req.body?.token);
  if (!token) return res.status(400).json({ error: "Log in first." });
  const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": STRIPE_PRICE,
    "line_items[0][quantity]": "1",
    client_reference_id: token,
    success_url: `${origin}/?upgraded=1`,
    cancel_url: `${origin}/?upgraded=0`,
  });
  try {
    const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const data = await resp.json();
    if (!resp.ok || !data.url) {
      return res.status(500).json({ error: "Couldn't start checkout. Try again in a minute." });
    }
    res.json({ url: data.url });
  } catch {
    res.status(500).json({ error: "Couldn't reach the payment provider." });
  }
});

app.get("/api/premium/status", (req, res) => {
  const { premium, remaining } = jaxStatus(resolveToken(req.query.token));
  res.json({ premium, remaining: premium ? null : remaining });
});

app.post("/api/premium/redeem", (req, res) => {
  const token = resolveToken(req.body?.token);
  const code = String(req.body?.code || "").trim().toUpperCase();
  if (!token || !code) return res.status(400).json({ error: "Missing code." });
  if (!premiumCodes().includes(code)) {
    return res.status(400).json({ error: "That code isn't valid. Double-check it and try again." });
  }
  db.prepare("INSERT OR REPLACE INTO premium_tokens (token, code_used) VALUES (?, ?)").run(token, code);
  res.json({ premium: true });
});

async function runAssistant(req, res, hangout) {
  const { question, vibes, nearby, clientToken, history, exclude } = req.body || {};
  const cleanHistory = Array.isArray(history)
    ? history.slice(-10).map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        text: String(h.text || "").slice(0, 500),
      }))
    : [];
  const cleanExclude = Array.isArray(exclude)
    ? exclude.slice(0, 40).map((t) => String(t).slice(0, 80))
    : [];
  const token = resolveToken(clientToken);

  const status = jaxStatus(token);
  if (!status.premium) {
    if (!token || status.remaining <= 0) {
      return res.status(402).json({
        error: "JAX free limit reached",
        limit: true,
        paymentLink: process.env.PAYMENT_LINK || null,
      });
    }
    const month = new Date().toISOString().slice(0, 7);
    db.prepare(
      `INSERT INTO jax_usage (token, month, count) VALUES (?, ?, 1)
       ON CONFLICT(token, month) DO UPDATE SET count = count + 1`
    ).run(token, month);
  }

  const cleanNearby = Array.isArray(nearby)
    ? nearby.slice(0, 40).map((n) => ({
        name: String(n.name || "").slice(0, 60),
        kind: String(n.kind || "").slice(0, 30),
      })).filter((n) => n.name)
    : [];
  const result = await assistant(hangout, question, Array.isArray(vibes) ? vibes : [], cleanNearby, cleanHistory, cleanExclude);
  const after = jaxStatus(token);
  res.json({ ...result, remaining: after.premium ? null : after.remaining, premium: after.premium });
}

app.post("/api/hangouts/:id/assistant", async (req, res) => {
  const h = getHangout(req.params.id);
  if (!h) return res.status(404).json({ error: "Hangout not found." });
  await runAssistant(req, res, h);
});

// Planning mode: JAX helps while you're still creating the hangout
app.post("/api/assistant", async (req, res) => {
  const draft = req.body?.draft || {};
  const pseudo = {
    id: null,
    title: String(draft.title || "your new hangout").slice(0, 80),
    note: "",
    places: [],
    responses: [],
    decidedSlot: null,
    expected: Math.max(2, parseInt(draft.expected) || 2),
  };
  await runAssistant(req, res, pseudo);
});

// ---------- static client ----------

const dist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => console.log(`Hangout running on http://localhost:${PORT}`));
