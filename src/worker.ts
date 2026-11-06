/** Cloudflare Workers の入り口。CSS・JS は wrangler.toml の [assets]（public/）から配信される。 */
import type { ExecutionContext, Hono } from "hono";
import { createApp } from "./app.tsx";
import { loadConfig } from "./config.ts";
import type { AppEnv } from "./context.ts";
import { neonDb } from "./db-neon.ts";
import { Repo } from "./models.ts";
import { r2Storage, type R2BucketLike } from "./storage.ts";

export interface Env {
  /** Neon の接続文字列（wrangler secret put DATABASE_URL） */
  DATABASE_URL: string;
  /** 写真を置く R2 バケット */
  MEDIA: R2BucketLike;
  HANKEN_ENV?: string;
  HANKEN_TIME_ZONE?: string;
}

let cached: { url: string; app: Hono<AppEnv> } | null = null;

function appFor(env: Env) {
  if (!cached || cached.url !== env.DATABASE_URL) {
    const app = createApp({
      repo: new Repo(neonDb(env.DATABASE_URL)),
      storage: r2Storage(env.MEDIA),
      config: loadConfig(env as unknown as Record<string, unknown>),
    });
    cached = { url: env.DATABASE_URL, app };
  }
  return cached.app;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return appFor(env).fetch(request, env, ctx);
  },
};
