import path from "node:path";

/** 環境変数から読む設定。Django版の settings.py に相当。 */
export interface Config {
  /** SQLite のファイル。":memory:" も可 */
  dbPath: string;
  /** アップロード写真の保存先 */
  mediaRoot: string;
  /** 本番では true（Cookie に Secure を付ける） */
  production: boolean;
  /** 日付の区切りに使うタイムゾーン */
  timeZone: string;
  photoMaxBytes: number;
  photoMaxSide: number;
  workImageMaxSide: number;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = process.env;
  return {
    dbPath: env.HANKEN_DB ?? path.resolve("db.sqlite3"),
    mediaRoot: env.HANKEN_MEDIA_ROOT ?? path.resolve("media"),
    production: env.NODE_ENV === "production",
    timeZone: env.HANKEN_TIME_ZONE ?? "Asia/Tokyo",
    photoMaxBytes: 10 * 1024 * 1024,
    photoMaxSide: 1280,
    workImageMaxSide: 800,
    ...overrides,
  };
}
