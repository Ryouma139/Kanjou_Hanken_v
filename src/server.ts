/**
 * 手元で動かす入り口（Node）。DB は PGlite（.pglite/ フォルダ）、写真は media/ フォルダ。
 * DATABASE_URL を指定すると、手元から Neon につないで動かすこともできる。
 */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.tsx";
import { loadConfig } from "./config.ts";
import type { DB } from "./db.ts";
import { neonDb } from "./db-neon.ts";
import { pgliteDb } from "./db-pglite.ts";
import { Repo } from "./models.ts";
import { fsStorage } from "./storage-fs.ts";

const env = process.env;
const db: DB = env.DATABASE_URL ? neonDb(env.DATABASE_URL) : await pgliteDb(env.HANKEN_PGLITE_DIR ?? ".pglite");
const app = createApp(
  { repo: new Repo(db), storage: fsStorage(env.HANKEN_MEDIA_ROOT ?? "media"), config: loadConfig(env) },
  (a) => a.use("/static/*", serveStatic({ root: "./public" })),
);

const port = Number(env.PORT ?? 8000);
const hostname = env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`感情の半券: http://${hostname === "0.0.0.0" ? "localhost" : hostname}:${info.port}/`);
  console.log(env.DATABASE_URL ? "DB: Neon（DATABASE_URL）" : `DB: PGlite（${env.HANKEN_PGLITE_DIR ?? ".pglite"}）`);
});
