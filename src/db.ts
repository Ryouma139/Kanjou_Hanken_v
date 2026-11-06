import { DatabaseSync } from "node:sqlite";

export type DB = DatabaseSync;

/** テーブル定義。Django版のマイグレーション（0001〜0007）を1つにまとめたもの。 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  is_staff INTEGER NOT NULL DEFAULT 0,
  date_joined TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, title)
);
CREATE INDEX IF NOT EXISTS works_kind_updated ON works (kind, updated_at DESC);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  placement TEXT NOT NULL DEFAULT 'footer',
  html TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_id INTEGER REFERENCES works(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'book',
  title TEXT NOT NULL,
  share TEXT NOT NULL DEFAULT 'public',
  created_at TEXT NOT NULL,
  before_emo TEXT NOT NULL,
  before_mood INTEGER NOT NULL,
  before_note TEXT NOT NULL DEFAULT '',
  before_photo TEXT NOT NULL DEFAULT '',
  before_at TEXT NOT NULL,
  after_emo TEXT NOT NULL DEFAULT '',
  after_mood INTEGER,
  after_note TEXT NOT NULL DEFAULT '',
  after_photo TEXT NOT NULL DEFAULT '',
  after_at TEXT
);
CREATE INDEX IF NOT EXISTS entries_share_before ON entries (share, before_emo);
CREATE INDEX IF NOT EXISTS entries_user_created ON entries (user_id, created_at DESC);
`;

export function openDb(file: string): DB {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
