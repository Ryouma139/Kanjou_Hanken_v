/** アプリ全体の組み立て。Django版の config/urls.py と settings.py のミドルウェアに相当。 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { appendTrailingSlash } from "hono/trailing-slash";
import { loadUser, loginRequired, messages } from "./auth.ts";
import type { Config } from "./config.ts";
import type { AppDeps, AppEnv } from "./context.ts";
import { Repo } from "./models.ts";
import type { DB } from "./db.ts";
import { pageCtx, render } from "./render.ts";
import { accountRoutes } from "./routes/accounts.tsx";
import { adminRoutes } from "./routes/admin.tsx";
import { hankenRoutes } from "./routes/hanken.tsx";
import { NotFoundPage } from "./views/pages.tsx";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** root の中にあるファイルだけを返す小さな静的配信 */
async function sendFile(c: Context<AppEnv>, root: string, rel: string, cache: string) {
  const base = path.resolve(root);
  const full = path.resolve(base, decodeURIComponent(rel));
  if (!full.startsWith(base + path.sep)) return c.notFound();
  const type = TYPES[path.extname(full).toLowerCase()];
  if (!type) return c.notFound();
  try {
    const data = await readFile(full);
    return c.body(data, 200, { "Content-Type": type, "Cache-Control": cache });
  } catch {
    return c.notFound();
  }
}

export function createApp(db: DB, config: Config) {
  const deps: AppDeps = { repo: new Repo(db), config };
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("app", deps);
    await next();
  });
  app.use("*", secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false }));
  app.use("*", appendTrailingSlash());
  // 写真2枚（各10MBまで）＋α
  app.use("*", bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => c.text("送信されたデータが大きすぎます。写真は10MB以下にしてください。", 413) }));
  app.use("*", csrf());
  app.use("*", loadUser);
  app.use("*", messages);

  // 静的ファイル（CSS・JavaScript）
  app.get("/static/*", (c) => sendFile(c, PUBLIC_DIR, c.req.path.slice("/static/".length), "public, max-age=3600"));
  // アップロードした写真はログインした人にだけ配信する
  app.get("/media/*", loginRequired, (c) =>
    sendFile(c, config.mediaRoot, c.req.path.slice("/media/".length), "private, max-age=86400"),
  );

  app.route("/accounts", accountRoutes());
  app.route("/admin/", adminRoutes()); // 末尾の / まで付けると、一覧の "/" が /admin/ になる
  app.route("/", hankenRoutes());

  app.notFound((c) => (c.var.app ? render(c, <NotFoundPage ctx={pageCtx(c)} />, 404) : c.text("Not Found", 404)));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.text("サーバーでエラーが起きました。時間をおいてもう一度お試しください。", 500);
  });

  return app;
}
