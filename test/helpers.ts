import { createApp } from "../src/app.tsx";
import { hashPassword } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { pgliteDb } from "../src/db-pglite.ts";
import type { Emotion, Kind, Share } from "../src/emotions.ts";
import { Repo, type User } from "../src/models.ts";
import { memoryStorage } from "../src/storage.ts";

export const PASSWORD = "pw-123456-x";

/** テストファイルごとに1つ、メモリ上の PostgreSQL（PGlite）でアプリを作る */
export async function setup() {
  const db = await pgliteDb();
  const storage = memoryStorage();
  const config = loadConfig({}, { timeZone: "Asia/Tokyo" });
  const repo = new Repo(db);
  const app = createApp({ repo, storage, config });
  const hash = await hashPassword(PASSWORD);

  const t = {
    app, repo, storage, config, db,
    a: null as unknown as User,
    b: null as unknown as User,
    client: () => new Client(app),
    /** 毎テストの前に：中身を空にして、ユーザー a と b を作り直す */
    async reset() {
      await db.query("TRUNCATE users, sessions, works, ads, entries RESTART IDENTITY CASCADE");
      storage.files.clear();
      t.a = await repo.createUser("a", hash);
      t.b = await repo.createUser("b", hash);
    },
    close: () => db.close(),
  };
  return t;
}

type App = ReturnType<typeof createApp>;

/** Cookie を覚えるテスト用ブラウザ */
export class Client {
  private jar = new Map<string, string>();
  constructor(private app: App) {}

  private headers(extra: Record<string, string> = {}) {
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return { ...(cookie ? { cookie } : {}), ...extra };
  }

  private remember(res: Response) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i);
      const value = pair!.slice(i + 1);
      if (!value || /max-age=0/i.test(sc)) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }

  async get(url: string) {
    return this.remember(await this.app.request(url, { headers: this.headers() }));
  }

  /** 同じサイトのフォームからの送信（Origin つき） */
  async post(url: string, data: Record<string, string | number | Blob> = {}, origin = "http://localhost") {
    const fd = new FormData();
    for (const [k, v] of Object.entries(data)) {
      if (v instanceof Blob) fd.append(k, v, "photo");
      else fd.append(k, String(v));
    }
    return this.remember(await this.app.request(url, { method: "POST", body: fd, headers: this.headers({ origin }) }));
  }

  async login(username: string, password = PASSWORD) {
    const r = await this.post("/accounts/login/", { username, password });
    if (r.status !== 302) throw new Error(`login failed: ${r.status}`);
    return r;
  }

  async text(url: string) {
    const r = await this.get(url);
    return { status: r.status, body: await r.text(), res: r };
  }
}

/** 1×1 の PNG（ブラウザで縮小済みの写真の代わり） */
const PNG_1PX = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (ch) => ch.charCodeAt(0));

export const png = () => new Blob([PNG_1PX], { type: "image/png" });
export const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0])], { type: "image/jpeg" });

/** 半券を直接つくる（Django版テストの make と同じ） */
export function make(
  repo: Repo, user: User, title: string, before: Emotion, bm: number,
  after?: Emotion, am?: number, share: Share = "public", kind: Kind = "movie",
  photos: { before?: string; after?: string } = {},
) {
  const now = new Date().toISOString();
  return repo.insertEntry({
    userId: user.id, workId: null, kind, title, share,
    beforeEmo: before, beforeMood: bm, beforeNote: "", beforePhoto: photos.before ?? "", beforeAt: now,
    afterEmo: after ?? "", afterMood: am ?? null, afterNote: "", afterPhoto: photos.after ?? "", afterAt: after ? now : null,
  });
}

export const location = (r: Response) => r.headers.get("location");
