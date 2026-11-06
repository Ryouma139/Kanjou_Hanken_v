/** データの型と、DB への読み書き。Django版の models.py に相当。 */
import type { DB, Row } from "./db.ts";
import { localDate, type YMD } from "./dates.ts";
import type { AdPlacement, Emotion, Kind, Share } from "./emotions.ts";

const str = (v: unknown) => (v == null ? "" : String(v));
/** DB の日時（Date または文字列）を ISO 文字列に */
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? "" : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown) => (v == null ? null : iso(v));
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
  dateJoined: iso(r.date_joined),
});

// ---------- Work ----------

/** 管理画面で登録する作品。「最近の作品」に更新日時の新しい順で並ぶ。 */
export interface Work {
  id: number;
  kind: Kind;
  title: string;
  note: string;
  url: string;
  /** 保存した画像のキー（アップロードした画像） */
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
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export const mediaUrl = (key: string) => (key ? `/media/${key}` : "");

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
  updatedAt: iso(r.updated_at),
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

  /** 結びついた作品 */
  work?: Work | null;
  /** 記録した人 */
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

const ENTRY_SELECT = `SELECT e.*,
  w.id AS w_id, w.kind AS w_kind, w.title AS w_title, w.note AS w_note, w.url AS w_url,
  w.image AS w_image, w.image_url AS w_image_url, w.created_at AS w_created_at, w.updated_at AS w_updated_at,
  u.username AS u_username, u.full_name AS u_full_name
  FROM entries e LEFT JOIN works w ON w.id = e.work_id JOIN users u ON u.id = e.user_id`;
const ENTRY_ORDER = `ORDER BY e.created_at DESC, e.id DESC`;

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
    createdAt: iso(r.created_at),
    beforeEmo: str(r.before_emo) as Emotion,
    beforeMood: Number(r.before_mood),
    beforeNote: str(r.before_note),
    beforePhoto: str(r.before_photo),
    beforeAt: iso(r.before_at),
    afterEmo: str(r.after_emo) as Emotion | "",
    afterMood: r.after_mood == null ? null : Number(r.after_mood),
    afterNote: str(r.after_note),
    afterPhoto: str(r.after_photo),
    afterAt: isoOrNull(r.after_at),
    work: r.w_id == null ? null : toWork(sub("w_")),
    user: { id: Number(r.user_id), username: str(r.u_username), fullName: str(r.u_full_name) },
  };
}

export type NewEntry = Omit<Entry, "id" | "createdAt" | "work" | "user">;

/** DB への読み書きをまとめたもの（すべて非同期） */
export class Repo {
  constructor(readonly db: DB) {}

  private async one<T>(sql: string, params: unknown[], map: (r: Row) => T): Promise<T | null> {
    const [r] = await this.db.query(sql, params);
    return r ? map(r) : null;
  }

  private async many<T>(sql: string, params: unknown[], map: (r: Row) => T): Promise<T[]> {
    return (await this.db.query(sql, params)).map(map);
  }

  async count(table: "works" | "ads" | "entries" | "users"): Promise<number> {
    const [r] = await this.db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`);
    return Number(r?.n ?? 0);
  }

  // ----- users -----

  async createUser(username: string, passwordHash: string, isStaff = false): Promise<User> {
    return (await this.one(
      "INSERT INTO users (username, password, is_staff) VALUES ($1, $2, $3) RETURNING *",
      [username, passwordHash, isStaff], toUser,
    ))!;
  }

  userById(id: number) {
    return this.one("SELECT * FROM users WHERE id = $1", [id], toUser);
  }

  /** ニックネームは英字の大小を区別しない */
  userByName(username: string) {
    return this.one("SELECT * FROM users WHERE lower(username) = lower($1)", [username], toUser);
  }

  async setUserPassword(id: number, passwordHash: string, isStaff?: boolean) {
    await this.db.query("UPDATE users SET password = $1, is_staff = COALESCE($2, is_staff) WHERE id = $3", [passwordHash, isStaff ?? null, id]);
  }

  // ----- sessions -----

  async createSession(id: string, userId: number, expiresAt: string) {
    await this.db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [id, userId, expiresAt]);
  }

  /** 期限内のセッションのユーザー */
  sessionUser(id: string) {
    return this.one(
      "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now()",
      [id], toUser,
    );
  }

  async deleteSession(id: string) {
    await this.db.query("DELETE FROM sessions WHERE id = $1 OR expires_at < now()", [id]);
  }

  // ----- works -----

  /** 作品名が一致する作品（前後の空白・英字の大小は無視）。同じ種類を優先し、なければ種類違いでも同名のもの。 */
  async matchWork(kind: Kind, title: string): Promise<Work | null> {
    const t = title.trim();
    if (!t) return null;
    return this.one(
      "SELECT * FROM works WHERE lower(title) = lower($1) ORDER BY (kind = $2) DESC, updated_at DESC LIMIT 1",
      [t, kind], toWork,
    );
  }

  recentWorks(kind: Kind, limit: number) {
    return this.many("SELECT * FROM works WHERE kind = $1 ORDER BY updated_at DESC, id DESC LIMIT $2", [kind, limit], toWork);
  }

  work(id: number) {
    return this.one("SELECT * FROM works WHERE id = $1", [id], toWork);
  }

  works(opts: { kind?: Kind; q?: string } = {}) {
    const where: string[] = [];
    const args: unknown[] = [];
    if (opts.kind) (args.push(opts.kind), where.push(`kind = $${args.length}`));
    if (opts.q) (args.push(`%${opts.q.replace(/[\\%_]/g, "\\$&")}%`), where.push(`title ILIKE $${args.length}`));
    return this.many(
      `SELECT * FROM works ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC, id DESC`,
      args, toWork,
    );
  }

  async workExists(kind: Kind, title: string, exceptId?: number): Promise<boolean> {
    const rows = await this.db.query(
      "SELECT 1 FROM works WHERE kind = $1 AND title = $2 AND id IS DISTINCT FROM $3",
      [kind, title, exceptId ?? null],
    );
    return rows.length > 0;
  }

  async saveWork(input: WorkInput, id?: number, at = nowIso()): Promise<Work> {
    const args = [input.kind, input.title, input.note, input.url, input.image, input.imageUrl, at];
    return (await (id
      ? this.one("UPDATE works SET kind=$1, title=$2, note=$3, url=$4, image=$5, image_url=$6, updated_at=$7 WHERE id=$8 RETURNING *", [...args, id], toWork)
      : this.one("INSERT INTO works (kind, title, note, url, image, image_url, updated_at, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *", args, toWork)))!;
  }

  async deleteWork(id: number) {
    await this.db.query("DELETE FROM works WHERE id = $1", [id]);
  }

  /** まだ作品に結びついていない同名の半券を結びつける */
  async linkEntriesToWorks(title: string) {
    const rows = await this.db.query<{ id: number; kind: Kind; title: string }>(
      "SELECT id, kind, title FROM entries WHERE work_id IS NULL AND lower(title) = lower($1)",
      [title.trim()],
    );
    for (const r of rows) {
      const w = await this.matchWork(r.kind, r.title);
      if (w) await this.db.query("UPDATE entries SET work_id = $1 WHERE id = $2", [w.id, r.id]);
    }
  }

  // ----- ads -----

  /** 表示中の広告すべて（場所ごとに並び順） */
  activeAds() {
    return this.many("SELECT * FROM ads WHERE is_active ORDER BY placement, sort_order, updated_at DESC", [], toAd);
  }

  ads() {
    return this.many("SELECT * FROM ads ORDER BY placement, sort_order, updated_at DESC", [], toAd);
  }

  ad(id: number) {
    return this.one("SELECT * FROM ads WHERE id = $1", [id], toAd);
  }

  async saveAd(input: AdInput, id?: number): Promise<Ad> {
    const args = [input.name, input.placement, input.html, input.isActive, input.order];
    return (await (id
      ? this.one("UPDATE ads SET name=$1, placement=$2, html=$3, is_active=$4, sort_order=$5, updated_at=now() WHERE id=$6 RETURNING *", [...args, id], toAd)
      : this.one("INSERT INTO ads (name, placement, html, is_active, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *", args, toAd)))!;
  }

  async deleteAd(id: number) {
    await this.db.query("DELETE FROM ads WHERE id = $1", [id]);
  }

  // ----- entries -----

  async insertEntry(e: NewEntry, createdAt = nowIso()): Promise<Entry> {
    const [r] = await this.db.query<{ id: number }>(
      `INSERT INTO entries (user_id, work_id, kind, title, share, created_at,
         before_emo, before_mood, before_note, before_photo, before_at,
         after_emo, after_mood, after_note, after_photo, after_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [e.userId, e.workId, e.kind, e.title, e.share, createdAt,
        e.beforeEmo, e.beforeMood, e.beforeNote, e.beforePhoto, e.beforeAt,
        e.afterEmo, e.afterMood, e.afterNote, e.afterPhoto, e.afterAt],
    );
    return (await this.entry(Number(r!.id)))!;
  }

  entry(id: number) {
    return this.one(`${ENTRY_SELECT} WHERE e.id = $1`, [id], toEntry);
  }

  /** 自分の半券だけ。他人のものは null（＝404）。 */
  ownEntry(id: number, userId: number) {
    return this.one(`${ENTRY_SELECT} WHERE e.id = $1 AND e.user_id = $2`, [id, userId], toEntry);
  }

  /** 自分の半券（新しい順） */
  userEntries(userId: number) {
    return this.many(`${ENTRY_SELECT} WHERE e.user_id = $1 ${ENTRY_ORDER}`, [userId], toEntry);
  }

  /** 自分の、観る前と観た後がそろった半券 */
  async userDoneEntries(userId: number): Promise<DoneEntry[]> {
    return (await this.many(
      `${ENTRY_SELECT} WHERE e.user_id = $1 AND e.after_emo <> '' AND e.after_mood IS NOT NULL ${ENTRY_ORDER}`,
      [userId], toEntry,
    )) as DoneEntry[];
  }

  /** 自分がいちばん最近記録した半券のうち、観る前の気持ちが候補に入っているもの */
  async latestBeforeEmo(userId: number, among: string[]): Promise<Emotion | null> {
    const [r] = await this.db.query<{ before_emo: Emotion }>(
      "SELECT before_emo FROM entries WHERE user_id = $1 AND before_emo = ANY($2) ORDER BY created_at DESC, id DESC LIMIT 1",
      [userId, among],
    );
    return r?.before_emo ?? null;
  }

  /** 共有された、観る前と観た後がそろった半券 */
  async sharedDoneEntries(): Promise<DoneEntry[]> {
    return (await this.many(
      `${ENTRY_SELECT} WHERE e.share <> 'private' AND e.after_emo <> '' AND e.after_mood IS NOT NULL ${ENTRY_ORDER}`,
      [], toEntry,
    )) as DoneEntry[];
  }

  allEntries() {
    return this.many(`${ENTRY_SELECT} ${ENTRY_ORDER}`, [], toEntry);
  }

  async saveAfter(id: number, a: Pick<Entry, "afterEmo" | "afterMood" | "afterNote" | "afterPhoto" | "afterAt">) {
    await this.db.query(
      "UPDATE entries SET after_emo=$1, after_mood=$2, after_note=$3, after_photo=$4, after_at=$5 WHERE id=$6",
      [a.afterEmo, a.afterMood, a.afterNote, a.afterPhoto, a.afterAt, id],
    );
  }

  async setShare(id: number, share: Share) {
    await this.db.query("UPDATE entries SET share = $1 WHERE id = $2", [share, id]);
  }

  /**
   * その写真を見てよいか。作品の画像はだれでも。半券の写真は、自分のものか共有されている半券のものだけ。
   */
  async photoVisible(key: string, userId: number): Promise<boolean> {
    if (key.startsWith("works/")) return true;
    const rows = await this.db.query(
      "SELECT 1 FROM entries WHERE (before_photo = $1 OR after_photo = $1) AND (user_id = $2 OR share <> 'private') LIMIT 1",
      [key, userId],
    );
    return rows.length > 0;
  }

  async deleteEntry(id: number) {
    await this.db.query("DELETE FROM entries WHERE id = $1", [id]);
  }
}
