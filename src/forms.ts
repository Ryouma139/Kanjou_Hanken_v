/** 入力の検査。Django版の forms.py に相当。写真の縮小はブラウザ側で済んでいる。 */
import { PASSWORD_HELP, validatePassword } from "./auth.ts";
import type { Config } from "./config.ts";
import {
  isAdPlacement, isEmotion, isKind, isShare,
  type AdPlacement, type Emotion, type Kind, type Share,
} from "./emotions.ts";
import { sniffImage, type ImageFile } from "./photos.ts";

export type Body = Record<string, string | File | (string | File)[]>;
export type Values = Record<string, string>;
export type Errors = Record<string, string[]>;

/** 画面に描き直すための入力値とエラー */
export interface FormState {
  values: Values;
  errors: Errors;
}

export type Result<T> = { ok: true; data: T } | { ok: false; state: FormState };

const MSG = {
  required: "このフィールドは必須です。",
  choice: (v: string) => `正しく選択してください。 ${v} は候補にありません。`,
  int: "整数を入力してください。",
  min: (n: number) => `この値は ${n} 以上でなければなりません。`,
  max: (n: number) => `この値は ${n} 以下でなければなりません。`,
  maxLen: (max: number, len: number) => `この値が ${max} 文字以下であることを確認してください（${len} 文字になっています）。`,
  image: "画像をアップロードしてください。アップロードしたファイルは画像でないか、または壊れています。",
  photoSize: "写真が大きすぎます。10MB以下の画像を選んでください。",
  url: "URLを正しく入力してください（http:// または https:// で始まるもの）。",
};

/** フォームの読み取りとエラーの記録を1か所で */
class Reader {
  readonly values: Values = {};
  readonly errors: Errors = {};
  constructor(private body: Body) {}

  private raw(name: string): string | File | undefined {
    const v = this.body[name];
    return Array.isArray(v) ? v[v.length - 1] : v;
  }

  add(name: string, msg: string) {
    (this.errors[name] ??= []).push(msg);
  }

  get ok() {
    return Object.keys(this.errors).length === 0;
  }

  state(): FormState {
    return { values: this.values, errors: this.errors };
  }

  /** 前後の空白を除いた文字列 */
  text(name: string, opts: { required?: boolean; max?: number; requiredMsg?: string; strip?: boolean } = {}): string {
    const r = this.raw(name);
    let v = typeof r === "string" ? r : "";
    if (opts.strip !== false) v = v.trim();
    this.values[name] = v;
    if (!v) {
      if (opts.required) this.add(name, opts.requiredMsg ?? MSG.required);
      return "";
    }
    const len = [...v].length;
    if (opts.max && len > opts.max) this.add(name, MSG.maxLen(opts.max, len));
    return v;
  }

  choice<T extends string>(name: string, is: (v: unknown) => v is T, opts: { required?: boolean; requiredMsg?: string } = {}): T | "" {
    const v = this.text(name, { required: opts.required, requiredMsg: opts.requiredMsg });
    if (!v) return "";
    if (!is(v)) {
      this.add(name, MSG.choice(v));
      return "";
    }
    return v;
  }

  int(name: string, opts: { required?: boolean; min?: number; max?: number; requiredMsg?: string } = {}): number | null {
    const v = this.text(name, { required: opts.required, requiredMsg: opts.requiredMsg });
    if (!v) return null;
    if (!/^[+-]?\d+$/.test(v)) {
      this.add(name, MSG.int);
      return null;
    }
    const n = Number(v);
    if (opts.min != null && n < opts.min) this.add(name, MSG.min(opts.min));
    if (opts.max != null && n > opts.max) this.add(name, MSG.max(opts.max));
    return n;
  }

  bool(name: string): boolean {
    const r = this.raw(name);
    const on = typeof r === "string" && r !== "" && r !== "false" && r !== "0";
    this.values[name] = on ? "on" : "";
    return on;
  }

  url(name: string, max: number): string {
    const v = this.text(name, { max });
    if (v && !isHttpUrl(v)) this.add(name, MSG.url);
    return v;
  }

  /** 画像ファイル。選ばれていなければ null。中身が JPEG / PNG / WebP / GIF でなければエラー。 */
  async image(name: string, maxBytes: number, tooBig = MSG.photoSize): Promise<ImageFile | null> {
    const r = this.raw(name);
    if (typeof r === "string" || !r || r.size === 0) return null;
    if (r.size > maxBytes) {
      this.add(name, tooBig);
      return null;
    }
    const data = new Uint8Array(await r.arrayBuffer());
    const kind = sniffImage(data);
    if (!kind) {
      this.add(name, MSG.image);
      return null;
    }
    return { data, ...kind };
  }
}

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

// ---------- 半券 ----------

export interface PhaseData {
  emo: Emotion;
  mood: number;
  note: string;
  photo: ImageFile | null;
}

export const NOTE_PLACEHOLDER = {
  before: "例：仕事で失敗して、頭が重い。",
  after: "例：主人公の言葉に救われた。少し泣いた。",
} as const;

const PHASE_LABEL = { before: "観る前の気持ち", after: "観た後の気持ち" } as const;

async function readPhase(f: Reader, prefix: "before" | "after", cfg: Config, required: boolean, msgs: { emo?: string; mood?: string } = {}) {
  const emo = f.choice(`${prefix}_emo`, isEmotion, {
    required,
    requiredMsg: msgs.emo ?? `${PHASE_LABEL[prefix]}を一つ選んでください。`,
  });
  const mood = f.int(`${prefix}_mood`, { required, min: 1, max: 10, requiredMsg: msgs.mood });
  const note = f.text(`${prefix}_note`, { max: 300 });
  const photo = await f.image(`${prefix}_photo`, cfg.photoMaxBytes);
  return { emo, mood, note, photo };
}

export interface RecordData {
  kind: Kind;
  title: string;
  share: Share;
  before: PhaseData;
  /** 「もう観終わった」にチェックしたときだけ */
  after: PhaseData | null;
}

export const RECORD_INITIAL: Values = { kind: "book", share: "public", before_mood: "5", after_mood: "5" };

export async function validateRecord(body: Body, cfg: Config): Promise<Result<RecordData>> {
  const f = new Reader(body);
  const kind = f.choice("kind", isKind, { required: true });
  const title = f.text("title", { required: true, max: 80, requiredMsg: "作品名を入力してください。" });
  const before = await readPhase(f, "before", cfg, true);
  const both = f.bool("both");
  let after = null;
  if (both) {
    after = await readPhase(f, "after", cfg, true, {
      emo: "観た後の気持ちも一つ選んでください。",
      mood: "観た後の気分を選んでください。",
    });
  } else {
    // 隠れている欄の値は描き直し用に覚えておくだけ
    for (const k of ["after_emo", "after_mood", "after_note"]) f.text(k);
  }
  const share = f.choice("share", isShare, { required: true });
  if (!f.ok) return { ok: false, state: f.state() };
  return {
    ok: true,
    data: {
      kind: kind as Kind,
      title,
      share: share as Share,
      before: before as PhaseData,
      after: after as PhaseData | null,
    },
  };
}

export async function validateAfter(body: Body, cfg: Config): Promise<Result<PhaseData>> {
  const f = new Reader(body);
  const after = await readPhase(f, "after", cfg, true);
  if (!f.ok) return { ok: false, state: f.state() };
  return { ok: true, data: after as PhaseData };
}

export function validateShare(body: Body): Share | null {
  const v = body.share;
  return isShare(v) ? v : null;
}

// ---------- アカウント ----------

export const USERNAME_HELP = "この項目は必須です。全角文字、半角英数字、@/./+/-/_ で150文字以下にしてください。";
export { PASSWORD_HELP };

export interface SignupData {
  username: string;
  password: string;
}

export async function validateSignup(body: Body, exists: (username: string) => Promise<boolean>): Promise<Result<SignupData>> {
  const f = new Reader(body);
  const username = f.text("username", { required: true, max: 150 });
  const p1 = f.text("password1", { required: true, strip: false });
  const p2 = f.text("password2", { required: true, strip: false });
  f.values.password1 = f.values.password2 = ""; // パスワードは描き直さない
  if (username) {
    if (!/^[\p{L}\p{N}_.@+-]+$/u.test(username))
      f.add("username", "有効なユーザー名を入力してください。この値は文字、数字、および @/./+/-/_ のみが含まれます。");
    else if (await exists(username)) f.add("username", "同じニックネームがすでに登録されています。");
  }
  if (p1 && p2 && p1 !== p2) f.add("password2", "確認用パスワードが一致しません。");
  else if (p2) for (const e of validatePassword(p2, username)) f.add("password2", e);
  if (!f.ok) return { ok: false, state: f.state() };
  return { ok: true, data: { username, password: p1 } };
}

// ---------- 管理画面 ----------

export interface WorkFormData {
  kind: Kind;
  title: string;
  note: string;
  url: string;
  imageUrl: string;
  /** 新しくアップロードされた画像 */
  image: ImageFile | null;
  clearImage: boolean;
}

export async function validateWork(
  body: Body, cfg: Config, exists: (kind: Kind, title: string) => Promise<boolean>,
): Promise<Result<WorkFormData>> {
  const f = new Reader(body);
  const kind = f.choice("kind", isKind, { required: true });
  const title = f.text("title", { required: true, max: 80 });
  const note = f.text("note", { max: 120 });
  const url = f.url("url", 200);
  const imageUrl = f.url("image_url", 500);
  const image = await f.image("image", cfg.photoMaxBytes, "画像が大きすぎます。10MB以下の画像を選んでください。");
  const clearImage = f.bool("image_clear");
  if (kind && title && (await exists(kind, title))) f.add("title", "同じ種類・作品名の作品がすでに登録されています。");
  if (!f.ok) return { ok: false, state: f.state() };
  return { ok: true, data: { kind: kind as Kind, title, note, url, imageUrl, image, clearImage } };
}

export interface AdFormData {
  name: string;
  placement: AdPlacement;
  html: string;
  isActive: boolean;
  order: number;
}

export function validateAd(body: Body): Result<AdFormData> {
  const f = new Reader(body);
  const name = f.text("name", { required: true, max: 80 });
  const placement = f.choice("placement", isAdPlacement, { required: true });
  const html = f.text("html", { required: true });
  const isActive = f.bool("is_active");
  const order = f.int("order", { required: true, min: 0, max: 32767 });
  if (!f.ok) return { ok: false, state: f.state() };
  return { ok: true, data: { name, placement: placement as AdPlacement, html, isActive, order: order ?? 0 } };
}

