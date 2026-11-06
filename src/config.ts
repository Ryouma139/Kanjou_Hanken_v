/** 設定。Node では process.env、Cloudflare Workers では env（wrangler.toml の vars と secret）から読む。 */
export interface Config {
  /** true なら Cookie に Secure を付ける */
  production: boolean;
  /** 日付の区切りに使うタイムゾーン */
  timeZone: string;
  /** 写真1枚の上限（ブラウザで縮小できなかったときの最後の砦） */
  photoMaxBytes: number;
  /** ブラウザで縮小するときの長辺 */
  photoMaxSide: number;
  workImageMaxSide: number;
}

export function loadConfig(env: Record<string, unknown> = {}, overrides: Partial<Config> = {}): Config {
  return {
    production: env.HANKEN_ENV === "production",
    timeZone: typeof env.HANKEN_TIME_ZONE === "string" && env.HANKEN_TIME_ZONE ? env.HANKEN_TIME_ZONE : "Asia/Tokyo",
    photoMaxBytes: 10 * 1024 * 1024,
    photoMaxSide: 1280,
    workImageMaxSide: 800,
    ...overrides,
  };
}
