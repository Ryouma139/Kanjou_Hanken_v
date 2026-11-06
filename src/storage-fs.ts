/** 手元用：フォルダに保存する（Node 専用） */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "./storage.ts";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
};

export function fsStorage(root: string): Storage {
  const base = path.resolve(root);
  const resolve = (key: string) => {
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("bad key");
    return full;
  };
  return {
    async put(key, data) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
    },
    async get(key) {
      try {
        const full = resolve(key);
        return { body: new Uint8Array(await readFile(full)), contentType: TYPES[path.extname(full)] ?? "application/octet-stream" };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await unlink(resolve(key)).catch(() => {});
    },
  };
}
