/**
 * 写真の置き場所。本番は Cloudflare R2、手元はフォルダ、テストはメモリ。
 * キーは「photos/2026/11/<ランダム>.jpg」のような形。
 */

export interface StoredFile {
  body: ReadableStream | Uint8Array;
  contentType: string;
}

export interface Storage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
  delete(key: string): Promise<void>;
}

/** Cloudflare R2 のバケットのうち、ここで使う部分だけの型 */
export interface R2BucketLike {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(key: string): Promise<void>;
}

/** Cloudflare R2 のバケットで保存する */
export function r2Storage(bucket: R2BucketLike): Storage {
  return {
    async put(key, data, contentType) {
      await bucket.put(key, data, { httpMetadata: { contentType } });
    },
    async get(key) {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return { body: obj.body, contentType: obj.httpMetadata?.contentType ?? "application/octet-stream" };
    },
    async delete(key) {
      await bucket.delete(key);
    },
  };
}

/** メモリに保存する（テスト用） */
export function memoryStorage(): Storage & { files: Map<string, StoredFile & { body: Uint8Array }> } {
  const files = new Map<string, StoredFile & { body: Uint8Array }>();
  return {
    files,
    async put(key, data, contentType) {
      files.set(key, { body: data, contentType });
    },
    async get(key) {
      return files.get(key) ?? null;
    },
    async delete(key) {
      files.delete(key);
    },
  };
}
