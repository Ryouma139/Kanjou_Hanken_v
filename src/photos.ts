/** 写真の縮小・保存・削除。Django版の shrink_photo と ImageField の役目。 */
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export class NotAnImage extends Error {}

/** 向きを補正し、長辺を side px 以下に縮めた JPEG にする。画像でなければ NotAnImage。 */
export async function shrinkPhoto(input: Buffer, side: number): Promise<Buffer> {
  try {
    return await sharp(input, { failOn: "error" })
      .rotate() // EXIF の向きを反映
      .resize(side, side, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new NotAnImage();
  }
}

/** 解決したパスが media の中に収まっているときだけ返す */
function inside(mediaRoot: string, rel: string): string | null {
  const root = path.resolve(mediaRoot);
  const full = path.resolve(root, rel);
  return full.startsWith(root + path.sep) ? full : null;
}

/** 推測されにくいファイル名で保存し、media からの相対パス（/ 区切り）を返す。 */
export async function saveMedia(mediaRoot: string, dir: string, data: Buffer): Promise<string> {
  const rel = `${dir}/${randomUUID().replaceAll("-", "")}.jpg`;
  const full = inside(mediaRoot, rel)!;
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return rel;
}

export async function deleteMedia(mediaRoot: string, rel: string | null | undefined) {
  if (!rel) return;
  const full = inside(mediaRoot, rel);
  if (!full) return;
  await unlink(full).catch(() => {});
}

/** 半券の写真の置き場所：photos/2026/11 */
export function photoDir(now = new Date()): string {
  return `photos/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}
