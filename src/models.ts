/** データの型と、DB への読み書き。Django版の models.py に相当。 */
import type { DB } from "./db.ts";
import { localDate, type YMD } from "./dates.ts";
import type { AdPlacement, Emotion, Kind, Share } from "./emotions.ts";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));
const nowIso = () => new Date().toISOString();

// ---------- User ----------

export interface User {
  id: number;
  username: string;
  password: string;
  fullName: string;
  isStaff: boolean;
  dateJoined: string;
}

const toUser = (r: Row): User => ({
  id: Number(r.id),
  username: str(r.username),
  password: str(r.password),
  fullName: str(r.full_name),
  isStaff: Boolean(r.is_staff),
  dateJoined: str(r.date_joined),
});

// ---------- Work ----------

/** 管理画面で登録する作品。「最近の作品」に更新日時の新しい順で並ぶ。 */
export interface Work {
  id: number;
  kind: Kind;
  title: string;
  note: string;
  url: string;
  /** media 以下の相対パス（アップロードした画像） */
  image: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

const toWork = (r: Row): Work => ({
  id: Number(r.id),
  kind: str(r.kind) as Kind,
  title: str(r.title),
  note: str(r.note),
  url: str(r.url),
  image: str(r.image),
  imageUrl: str(r.image_url),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export const mediaUrl = (p: string) => (p ? `/media/${p}` : "");

/** 表示する画像のURL。アップロードした画像を優先し、なければ画像URL。どちらもなければ空。 */
export const coverUrl = (w: Pick<Work, "image" | "imageUrl"> | null | undefined) =>
  !w ? "" : w.image ? mediaUrl(w.image) : w.imageUrl;

export type WorkInput = Pick<Work, "kind" | "title" | "note" | "url" | "image" | "imageUrl">;

// ---------- Ad ----------

/** 管理画面で登録する広告タグ。選んだ場所に「PR」付きで、HTML をそのまま表示する。 */
export interface Ad {
  id: number;
  name: string;
  placement: AdPlacement;
  html: string;
  isActive: boolean;
  order: number;
  updatedAt: string;
}

const toAd = (r: Row): Ad => ({
  id: Number(r.id),
  name: str(r.name),
  placement: str(r.placement) as AdPlacement,
  html: str(r.html),
  isActive: Boolean(r.is_active),
  order: Number(r.sort_order),
  updatedAt: str(r.updated_at),
});

export type AdInput = Pick<Ad, "name" | "placement" | "html" | "isActive" | "order">;

// ---------- Entry ----------

/** 1枚の半券。左半分が観る前、右半分が観た後。 */
export interface Entry {
  id: number;
  userId: number;
  workId: number | null;
  kind: Kind;
  title: string;
  share: Share;
  createdAt: string;

  beforeEmo: Emotion;
  beforeMood: number;
  beforeNote: string;
  beforePhoto: string;
  beforeAt: string;

  afterEmo: Emotion | "";
  afterMood: number | null;
  afterNote: string;
  afterPhoto: string;
  afterAt: string | null;

  /** 結びついた作品（読み込んだときだけ） */
  work?: Work | null;
  /** 記録した人（読み込んだときだけ） */
  user?: Pick<User, "id" | "username" | "fullName">;
}

/** 観る前と観た後がそろった半券 */
export type DoneEntry = Entry & { afterEmo: Emotion; afterMood: number };

export const isDone = (e: Entry): e is DoneEntry => !!e.afterEmo && e.afterMood != null;

export function delta(e: Entry): number | null {
  return isDone(e) ? e.afterMood - e.beforeMood : null;
}

/** 観終わった日（設定のタイムゾーン）。観た後が未記録なら null。 */
export function finishedOn(e: Entry, timeZone: string): YMD | null {
  return isDone(e) ? localDate(e.afterAt ?? e.createdAt, timeZone) : null;
}

const ENTRY_COLS = `e.*,
  w.id AS w_id, w.kind AS w_kind, w.title AS w_title, w.note AS w_note, w.url AS w_url,
  w.image AS w_image, w.image_url AS w_image_url, w.created_at AS w_created_at, w.updated_at AS w_updated_at,
  u.username AS u_username, u.full_name AS u_full_name`;
const ENTRY_FROM = `entries e LEFT JOIN works w ON w.id = e.work_id JOIN users u ON u.id = e.user_id`;

function toEntry(r: Row): Entry {
  const sub = (prefix: string) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    workId: r.work_id == null ? null : Number(r.work_id),
    kind: str(r.kind) as Kind,
    title: str(r.title),
    share: str(r.share) as Share,
    createdAt: str(r.created_at),
    beforeEmo: str(r.before_emo) as Emotion,
    beforeMood: Number(r.before_mood),
    beforeNote: str(r.before_note),
    beforePhoto: str(r.before_photo),
    beforeAt: str(r.before_at),
    afterEmo: str(r.after_emo) as Emotion | "",
    afterMood: r.after_mood == null ? null : Number(r.after_mood),
    afterNote: str(r.after_note),
    afterPhoto: str(r.after_photo),
    afterAt: r.after_at == null ? null : str(r.after_at),
    work: r.w_id == null ? null : toWork(sub("w_")),
    user: { id: Number(r.user_id), username: str(r.u_username), fullName: str(r.u_full_name) },
  };
}

export type NewEntry = Omit<Entry, "id" | "createdAt" | "work" | "user">;

/** DB への読み書きをまとめたもの */
export class Repo {
  constructor(readonly db: DB) {}

  // ----- users -----

  createUser(username: string, passwordHash: string, isStaff = false): User {
    const r = this.db
      .prepare("INSERT INTO users (username, password, is_staff, date_joined) VALUES (?, ?, ?, ?) RETURNING *")
      .get(username, passwordHash, isStaff ? 1 : 0, nowIso());
    return toUser(r as Row);
  }

  userById(id: number): User | null {
    const r = this.db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    return r ? toUser(r as Row) : null;
  }

  userByName(username: string): User | null {
    const r = this.db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    return r ? toUser(r as Row) : null;
  }

  setUserPassword(id: number, passwordHash: string, isStaff?: boolean) {
    this.db.prepare("UPDATE users SET password = ? WHERE id = ?").run(passwordHash, id);
    if (isStaff !== undefined) this.db.prepare("UPDATE users SET is_staff = ? WHERE id = ?").run(isStaff ? 1 : 0, id);
  }

  // ----- works -----

  /** 作品名が一致する作品（前後の空白・英字の大小は無視）。同じ種類を優先し、なければ種類違いでも同名のもの。 */
  matchWork(kind: Kind, title: string): Work | null {
    const t = title.trim();
    if (!t) return null;
    const r = this.db
      .prepare("SELECT * FROM works WHERE title = ? COLLATE NOCASE ORDER BY (kind = ?) DESC, updated_at DESC LIMIT 1")
      .get(t, kind);
    return r ? toWork(r as Row) : null;
  }

  recentWorks(kind: Kind, limit: number): Work[] {
    return this.db
      .prepare("SELECT * FROM works WHERE kind = ? ORDER BY updated_at DESC, id DESC LIMIT ?")
      .all(kind, limit)
      .map((r) => toWork(r as Row));
  }

  work(id: number): Work | null {
    const r = this.db.prepare("SELECT * FROM works WHERE id = ?").get(id);
    return r ? toWork(r as Row) : null;
  }

  works(opts: { kind?: Kind; q?: string } = {}): Work[] {
    const where: string[] = [];
    const args: string[] = [];
    if (opts.kind) (where.push("kind = ?"), args.push(opts.kind));
    if (opts.q) (where.push("title LIKE ? ESCAPE '\\'"), args.push(`%${opts.q.replace(/[\\%_]/g, "\\$&")}%`));
    const sql = `SELECT * FROM works ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC, id DESC`;
    return this.db.prepare(sql).all(...args).map((r) => toWork(r as Row));
  }

  workExists(kind: Kind, title: string, exceptId?: number): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM works WHERE kind = ? AND title = ? AND id IS NOT ?")
      .get(kind, title, exceptId ?? null);
  }

  saveWork(input: WorkInput, id?: number, at = nowIso()): Work {
    const args = [input.kind, input.title, input.note, input.url, input.image, input.imageUrl, at];
    const r = id
      ? this.db
          .prepare("UPDATE works SET kind=?, title=?, note=?, url=?, image=?, image_url=?, updated_at=? WHERE id=? RETURNING *")
          .get(...args, id)
      : this.db
          .prepare("INSERT INTO works (kind, title, note, url, image, image_url, updated_at, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING *")
          .get(...args, at);
    return toWork(r as Row);
  }

  deleteWork(id: number) {
    this.db.prepare("DELETE FROM works WHERE id = ?").run(id);
  }

  /** まだ作品に結びついていない同名の半券を結びつける */
  linkEntriesToWorks(title: string) {
    const rows = this.db
      .prepare("SELECT id, kind, title FROM entries WHERE work_id IS NULL AND title = ? COLLATE NOCASE")
      .all(title.trim()) as Row[];
    const upd = this.db.prepare("UPDATE entries SET work_id = ? WHERE id = ?");
    for (const r of rows) {
      const w = this.matchWork(str(r.kind) as Kind, str(r.title));
      if (w) upd.run(w.id, Number(r.id));
    }
  }

  // ----- ads -----

  activeAds(placement: AdPlacement): Ad[] {
    return this.db
      .prepare("SELECT * FROM ads WHERE placement = ? AND is_active = 1 ORDER BY sort_order, updated_at DESC")
      .all(placement)
      .map((r) => toAd(r as Row));
  }

  ads(): Ad[] {
    return this.db.prepare("SELECT * FROM ads ORDER BY placement, sort_order, updated_at DESC").all().map((r) => toAd(r as Row));
  }

  ad(id: number): Ad | null {
    const r = this.db.prepare("SELECT * FROM ads WHERE id = ?").get(id);
    return r ? toAd(r as Row) : null;
  }

  saveAd(input: AdInput, id?: number): Ad {
    const args = [input.name, input.placement, input.html, input.isActive ? 1 : 0, input.order, nowIso()];
    const r = id
      ? this.db.prepare("UPDATE ads SET name=?, placement=?, html=?, is_active=?, sort_order=?, updated_at=? WHERE id=? RETURNING *").get(...args, id)
      : this.db.prepare("INSERT INTO ads (name, placement, html, is_active, sort_order, updated_at) VALUES (?,?,?,?,?,?) RETURNING *").get(...args);
    return toAd(r as Row);
  }

  deleteAd(id: number) {
    this.db.prepare("DELETE FROM ads WHERE id = ?").run(id);
  }

  // ----- entries -----

  insertEntry(e: NewEntry, createdAt = nowIso()): Entry {
    const r = this.db
      .prepare(
        `INSERT INTO entries (user_id, work_id, kind, title, share, created_at,
           before_emo, before_mood, before_note, before_photo, before_at,
           after_emo, after_mood, after_note, after_photo, after_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      )
      .get(e.userId, e.workId, e.kind, e.title, e.share, createdAt,
        e.beforeEmo, e.beforeMood, e.beforeNote, e.beforePhoto, e.beforeAt,
        e.afterEmo, e.afterMood, e.afterNote, e.afterPhoto, e.afterAt) as Row;
    return this.entry(Number(r.id))!;
  }

  entry(id: number): Entry | null {
    const r = this.db.prepare(`SELECT ${ENTRY_COLS} FROM ${ENTRY_FROM} WHERE e.id = ?`).get(id);
    return r ? toEntry(r as Row) : null;
  }

  /** 自分の半券だけ。他人のものは null（＝404）。 */
  ownEntry(id: number, userId: number): Entry | null {
    const e = this.entry(id);
    return e && e.userId === userId ? e : null;
  }

  /** 自分の半券（新しい順） */
  userEntries(userId: number): Entry[] {
    return this.db
      .prepare(`SELECT ${ENTRY_COLS} FROM ${ENTRY_FROM} WHERE e.user_id = ? ORDER BY e.created_at DESC, e.id DESC`)
      .all(userId)
      .map((r) => toEntry(r as Row));
  }

  /** 共有された、観る前と観た後がそろった半券 */
  sharedDoneEntries(): DoneEntry[] {
    return this.db
      .prepare(
        `SELECT ${ENTRY_COLS} FROM ${ENTRY_FROM}
         WHERE e.share != 'private' AND e.after_emo != '' AND e.after_mood IS NOT NULL
         ORDER BY e.created_at DESC, e.id DESC`,
      )
      .all()
      .map((r) => toEntry(r as Row) as DoneEntry);
  }

  allEntries(): Entry[] {
    return this.db
      .prepare(`SELECT ${ENTRY_COLS} FROM ${ENTRY_FROM} ORDER BY e.created_at DESC, e.id DESC`)
      .all()
      .map((r) => toEntry(r as Row));
  }

  saveAfter(id: number, a: Pick<Entry, "afterEmo" | "afterMood" | "afterNote" | "afterPhoto" | "afterAt">) {
    this.db
      .prepare("UPDATE entries SET after_emo=?, after_mood=?, after_note=?, after_photo=?, after_at=? WHERE id=?")
      .run(a.afterEmo, a.afterMood, a.afterNote, a.afterPhoto, a.afterAt, id);
  }

  setShare(id: number, share: Share) {
    this.db.prepare("UPDATE entries SET share = ? WHERE id = ?").run(share, id);
  }

  deleteEntry(id: number) {
    this.db.prepare("DELETE FROM entries WHERE id = ?").run(id);
  }

  /** 写真ファイルの後片付け用：ユーザーの全写真のパス */
  photosOf(entries: Entry[]): string[] {
    return entries.flatMap((e) => [e.beforePhoto, e.afterPhoto]).filter(Boolean);
  }
}
