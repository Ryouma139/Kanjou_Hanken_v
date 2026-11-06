/**
 * DB の窓口。本番は Neon（PostgreSQL）、手元とテストは PGlite（ブラウザでも動く PostgreSQL）を使う。
 * どちらも「SQL と $1, $2… の値を渡すと行の配列が返る」形にそろえる。
 */

export type Row = Record<string, unknown>;

export interface DB {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

/** テーブル定義。Django版のマイグレーション（0001〜0007）を1つにまとめたもの。何度実行しても安全。 */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT NOT NULL DEFAULT '',
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    date_joined TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username))`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at)`,

  `CREATE TABLE IF NOT EXISTS works (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (kind, title)
  )`,
  `CREATE INDEX IF NOT EXISTS works_kind_updated ON works (kind, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS works_title_lower ON works (lower(title))`,

  `CREATE TABLE IF NOT EXISTS ads (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    placement TEXT NOT NULL DEFAULT 'footer',
    html TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_id INTEGER REFERENCES works(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'book',
    title TEXT NOT NULL,
    share TEXT NOT NULL DEFAULT 'public',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    before_emo TEXT NOT NULL,
    before_mood SMALLINT NOT NULL CHECK (before_mood BETWEEN 1 AND 10),
    before_note TEXT NOT NULL DEFAULT '',
    before_photo TEXT NOT NULL DEFAULT '',
    before_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    after_emo TEXT NOT NULL DEFAULT '',
    after_mood SMALLINT CHECK (after_mood BETWEEN 1 AND 10),
    after_note TEXT NOT NULL DEFAULT '',
    after_photo TEXT NOT NULL DEFAULT '',
    after_at TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS entries_share_before ON entries (share, before_emo)`,
  `CREATE INDEX IF NOT EXISTS entries_user_created ON entries (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS entries_unlinked_title ON entries (lower(title)) WHERE work_id IS NULL`,
];

export async function migrate(db: DB) {
  for (const stmt of SCHEMA) await db.query(stmt);
}
