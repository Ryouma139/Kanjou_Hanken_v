/**
 * 写真の受け取り。縮小と向きの補正はブラウザ側（public/static/hanken/app.js）で済ませてから送られてくる。
 * サーバーでは「本当に画像か」を先頭のバイトで確かめ、推測されにくい名前で保存するだけ。
 */
import type { Storage } from "./storage.ts";

export interface ImageFile {
  data: Uint8Array;
  contentType: string;
  ext: string;
}

const startsWith = (d: Uint8Array, sig: number[], at = 0) => sig.every((b, i) => d[at + i] === b);

/** JPEG / PNG / WebP / GIF なら種類を返す。それ以外は null。 */
export function sniffImage(d: Uint8Array): { contentType: string; ext: string } | null {
  if (startsWith(d, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", ext: "jpg" };
  if (startsWith(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", ext: "png" };
  if (startsWith(d, [0x52, 0x49, 0x46, 0x46]) && startsWith(d, [0x57, 0x45, 0x42, 0x50], 8)) return { contentType: "image/webp", ext: "webp" };
  if (startsWith(d, [0x47, 0x49, 0x46, 0x38])) return { contentType: "image/gif", ext: "gif" };
  return null;
}

const randomName = () => crypto.randomUUID().replaceAll("-", "");

/** 推測されにくい名前で保存し、キーを返す */
export async function saveImage(storage: Storage, dir: string, img: ImageFile): Promise<string> {
  const key = `${dir}/${randomName()}.${img.ext}`;
  await storage.put(key, img.data, img.contentType);
  return key;
}

export async function deleteImage(storage: Storage, key: string | null | undefined) {
  if (key) await storage.delete(key);
}

/** 半券の写真の置き場所：photos/2026/11 */
export function photoDir(now = new Date()): string {
  return `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** キーとして安全か（/media/ の URL から受け取るとき用） */
export function isSafeKey(key: string): boolean {
  return /^(photos|works)\/[A-Za-z0-9/_-]+\.(jpg|png|webp|gif)$/.test(key) && !key.includes("..");
}
