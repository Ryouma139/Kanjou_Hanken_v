import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../src/app.tsx";
import { hashPassword } from "../src/auth.ts";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import type { Emotion, Kind, Share } from "../src/emotions.ts";
import { Repo, type User } from "../src/models.ts";

export const PASSWORD = "pw-123456-x";

/** 毎回まっさらな DB と写真置き場でアプリを作る */
export async function setup() {
  const mediaRoot = mkdtempSync(path.join(tmpdir(), "hanken-test-"));
  const config = loadConfig({ dbPath: ":memory:", mediaRoot, production: false, timeZone: "Asia/Tokyo" });
  const db = openDb(":memory:");
  const app = createApp(db, config);
  const repo = new Repo(db);
  const hash = await hashPassword(PASSWORD);
  const a = repo.createUser("a", hash);
  const b = repo.createUser("b", hash);
  return {
    app, repo, config, mediaRoot, a, b,
    client: () => new Client(app),
    cleanup: () => {
      db.close();
      rmSync(mediaRoot, { recursive: true, force: true });
    },
  };
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
      if (v instanceof Blob) fd.append(k, v, "p.png");
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

export async function png(w = 2000, h = 1000): Promise<Blob> {
  const buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 120, g: 140, b: 200 } } }).png().toBuffer();
  return new Blob([new Uint8Array(buf)], { type: "image/png" });
}

/** 半券を直接つくる（Django版テストの make と同じ） */
export function make(
  repo: Repo, user: User, title: string, before: Emotion, bm: number,
  after?: Emotion, am?: number, share: Share = "public", kind: Kind = "movie",
) {
  const now = new Date().toISOString();
  return repo.insertEntry({
    userId: user.id, workId: null, kind, title, share,
    beforeEmo: before, beforeMood: bm, beforeNote: "", beforePhoto: "", beforeAt: now,
    afterEmo: after ?? "", afterMood: am ?? null, afterNote: "", afterPhoto: "", afterAt: after ? now : null,
  });
}

export const location = (r: Response) => r.headers.get("location");
