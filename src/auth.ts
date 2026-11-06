/**
 * パスワード・ログイン状態（セッション）・ひとことメッセージ。Django の auth / sessions / messages の代わり。
 * Cloudflare Workers でも動くよう、Web 標準の API（Web Crypto など）だけを使う。
 */
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "./context.ts";
import type { User } from "./models.ts";

// ---------- 文字列とバイト ----------

const enc = new TextEncoder();
const dec = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const toBase64Url = (bytes: Uint8Array) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (s: string) => fromBase64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

// ---------- パスワード（PBKDF2-SHA256） ----------

// Cloudflare Workers の Web Crypto は 100,000 回までに対応
const ITERATIONS = 100_000;

async function pbkdf2(pw: string, salt: Uint8Array<ArrayBuffer>, iterations: number, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, bytes * 8);
  return new Uint8Array(bits);
}

/** 長さが同じなら、中身に関係なく同じ時間で比べる */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(pw, salt, ITERATIONS, 32);
  return `pbkdf2_sha256$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, iter, salt, hash] = stored.split("$");
  if (algo !== "pbkdf2_sha256" || !iter || !salt || !hash) return false;
  const expected = fromBase64(hash);
  const actual = await pbkdf2(pw, fromBase64(salt), Number(iter), expected.length);
  return sameBytes(actual, expected);
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

export async function login(c: Context<AppEnv>, user: User) {
  const { repo, config } = c.var.app;
  const id = toBase64Url(randomBytes(32));
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await repo.createSession(id, user.id, expires.toISOString());
  setCookie(c, SESSION_COOKIE, id, { path: "/", httpOnly: true, sameSite: "Lax", secure: config.production, expires });
  c.set("user", user);
}

export async function logout(c: Context<AppEnv>) {
  const id = getCookie(c, SESSION_COOKIE);
  if (id) await c.var.app.repo.deleteSession(id);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: c.var.app.config.production });
  c.set("user", null);
}

/** Cookie からログイン中のユーザーを読む */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = getCookie(c, SESSION_COOKIE);
  c.set("user", id ? await c.var.app.repo.sessionUser(id) : null);
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
      const parsed = JSON.parse(dec.decode(fromBase64Url(raw)));
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
  const secure = c.var.app.config.production;
  if (out.length) {
    setCookie(c, MSG_COOKIE, toBase64Url(enc.encode(JSON.stringify(out))), { path: "/", httpOnly: true, sameSite: "Lax", secure });
  } else if (raw) {
    deleteCookie(c, MSG_COOKIE, { path: "/", secure });
  }
};
