import { DatabaseSync } from "node:sqlite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "hangout.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS hangouts (
    id TEXT PRIMARY KEY,
    creator_key TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT NOT NULL,
    note TEXT DEFAULT '',
    days TEXT NOT NULL,        -- JSON array of ISO dates
    blocks TEXT NOT NULL,      -- JSON array of block keys
    places TEXT DEFAULT '[]',  -- JSON array of place names
    expected INTEGER DEFAULT 0,
    decided_slot TEXT,         -- "date|block" once decided
    decided_place TEXT,
    decided_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hangout_id TEXT NOT NULL REFERENCES hangouts(id),
    name TEXT NOT NULL,
    slots TEXT NOT NULL,       -- JSON array of "date|block"
    place_vote TEXT,
    interests TEXT DEFAULT '[]', -- JSON array of vibe tags
    avatar TEXT DEFAULT '',      -- avatar seed string
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(hangout_id, name)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pass TEXT NOT NULL,
    seed TEXT DEFAULT '',
    vibes TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS squads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🎈',
    owner TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS squad_members (
    squad_id TEXT NOT NULL REFERENCES squads(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (squad_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hangout_id TEXT NOT NULL REFERENCES hangouts(id),
    user_name TEXT NOT NULL,
    photo TEXT NOT NULL,
    caption TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jax_usage (
    token TEXT NOT NULL,
    month TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (token, month)
  );

  CREATE TABLE IF NOT EXISTS premium_tokens (
    token TEXT PRIMARY KEY,
    code_used TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Lightweight migrations for databases created by older versions
for (const stmt of [
  "ALTER TABLE responses ADD COLUMN avatar TEXT DEFAULT ''",
  "ALTER TABLE responses ADD COLUMN client_token TEXT DEFAULT ''",
  "ALTER TABLE hangouts ADD COLUMN canceled_at TEXT",
  "ALTER TABLE premium_tokens ADD COLUMN stripe_customer TEXT",
  "ALTER TABLE premium_tokens ADD COLUMN stripe_sub TEXT",
  "ALTER TABLE hangouts ADD COLUMN squad_id TEXT",
  "ALTER TABLE hangouts ADD COLUMN surprise INTEGER DEFAULT 0",
  "ALTER TABLE hangouts ADD COLUMN revealed INTEGER DEFAULT 0",
  "ALTER TABLE responses ADD COLUMN bailed INTEGER DEFAULT 0",
]) {
  try {
    db.exec(stmt);
  } catch {
    /* column already exists */
  }
}

export default db;
