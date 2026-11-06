/** パスワード・ログイン状態（セッション）・ひとことメッセージ。Django の auth / sessions / messages の代わり。 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./context.ts";
import type { User } from "./models.ts";

// ---------- パスワード ----------

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((ok, ng) => scryptCb(pw, salt, keylen, opts, (err, key) => (err ? ng(err) : ok(key))));

const N = 16384, R = 8, P = 1, KEYLEN = 32;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(pw, Buffer.from(salt, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** パスワードの決まり（Django の標準バリデータと同じ4つ） */
export const PASSWORD_HELP = [
  "あなたの他の個人情報と似ているパスワードにはできません。",
  "パスワードは最低 8 文字以上必要です。",
  "よく使われるパスワードにはできません。",
  "数字だけのパスワードにはできません。",
];

const COMMON = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890", "qwertyuiop", "qwerty123",
  "iloveyou", "11111111", "00000000", "abc12345", "abcd1234", "letmein1", "welcome1", "admin123", "passw0rd",
  "sunshine", "princess", "football", "baseball", "dragon12", "monkey12", "1q2w3e4r", "zaq12wsx", "asdfghjk",
]);

export function validatePassword(pw: string, username: string): string[] {
  const errs: string[] = [];
  const u = username.toLowerCase();
  const p = pw.toLowerCase();
  if (u.length >= 3 && (p.includes(u) || u.includes(p))) errs.push("このパスワードは ニックネーム と似すぎています。");
  if (pw.length < 8) errs.push("このパスワードは短すぎます。最低 8 文字以上必要です。");
  if (COMMON.has(p)) errs.push("このパスワードは一般的すぎます。");
  if (/^\d+$/.test(pw)) errs.push("このパスワードは数字しか使われていません。");
  return errs;
}

// ---------- セッション ----------

const SESSION_COOKIE = "sessionid";
const SESSION_DAYS = 14;

export function login(c: Context<AppEnv>, user: User) {
  const { repo, config } = c.var.app;
  const id = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  repo.db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(id, user.id, expires.toISOString());
  setCookie(c, SESSION_COOKIE, id, {
    path: "/", httpOnly: true, sameSite: "Lax", secure: config.production, expires,
  });
  c.set("user", user);
}

export function logout(c: Context<AppEnv>) {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) c.var.app.repo.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  c.set("user", null);
}

/** Cookie からログイン中のユーザーを読む */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = getCookie(c, SESSION_COOKIE);
  let user: User | null = null;
  if (id) {
    const { repo } = c.var.app;
    const s = repo.db.prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(id) as
      | { user_id: number; expires_at: string }
      | undefined;
    if (s && s.expires_at > new Date().toISOString()) user = repo.userById(s.user_id);
    else if (s) repo.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
  c.set("user", user);
  await next();
};

/** ログインしていなければログイン画面へ（戻り先つき） */
export const loginRequired: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) {
    const u = new URL(c.req.url);
    return c.redirect(`/accounts/login/?next=${encodeURIComponent(u.pathname + u.search)}`);
  }
  await next();
};

export const staffRequired: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) return loginRequired(c, next);
  if (!c.var.user.isStaff) return c.notFound();
  await next();
};

/** ログイン後の戻り先。サイト内のパスだけを許す。 */
export function safeNext(next: string | undefined | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

// ---------- ひとことメッセージ（次の画面で一度だけ表示） ----------

export interface Message {
  level: "success" | "error";
  text: string;
}

const MSG_COOKIE = "messages";

export function flash(c: Context<AppEnv>, text: string, level: Message["level"] = "success") {
  c.var.outMessages.push({ level, text });
}

export const messages: MiddlewareHandler<AppEnv> = async (c, next) => {
  const raw = getCookie(c, MSG_COOKIE);
  let incoming: Message[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      if (Array.isArray(parsed))
        incoming = parsed
          .filter((m) => m && typeof m.text === "string")
          .map((m) => ({ level: m.level === "error" ? "error" : "success", text: m.text }));
    } catch {
      /* 壊れた Cookie は捨てる */
    }
  }
  c.set("messages", incoming);
  c.set("outMessages", []);
  await next();
  const out = c.var.outMessages;
  if (out.length) {
    setCookie(c, MSG_COOKIE, Buffer.from(JSON.stringify(out)).toString("base64url"), {
      path: "/", httpOnly: true, sameSite: "Lax", secure: c.var.app.config.production,
    });
  } else if (raw) {
    deleteCookie(c, MSG_COOKIE, { path: "/" });
  }
};
