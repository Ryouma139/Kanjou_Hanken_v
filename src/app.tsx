/**
 * アプリ全体の組み立て。Django版の config/urls.py と settings.py のミドルウェアに相当。
 * Cloudflare Workers（src/worker.ts）と Node（src/server.ts）の両方から使う。
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { appendTrailingSlash } from "hono/trailing-slash";
import { loadUser, loginRequired, messages } from "./auth.ts";
import type { AppDeps, AppEnv } from "./context.ts";
import { isSafeKey } from "./photos.ts";
import { pageCtx, render } from "./render.ts";
import { accountRoutes } from "./routes/accounts.tsx";
import { adminRoutes } from "./routes/admin.tsx";
import { hankenRoutes } from "./routes/hanken.tsx";
import { NotFoundPage } from "./views/pages.tsx";

export function createApp(deps: AppDeps, extend?: (app: Hono<AppEnv>) => void) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("app", deps);
    await next();
  });
  app.use("*", secureHeaders({ contentSecurityPolicy: undefined, crossOriginEmbedderPolicy: false }));
  // /mine → /mine/ のように直す（ファイルの URL は対象外）
  const trailingSlash = appendTrailingSlash();
  app.use("*", (c, next) => (/^\/(media|static)\//.test(c.req.path) ? next() : trailingSlash(c, next)));
  // 写真2枚（各10MBまで）＋α
  app.use("*", bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => c.text("送信されたデータが大きすぎます。写真は10MB以下にしてください。", 413) }));
  app.use("*", csrf());

  // 静的ファイルなど、DB を使わないものを先に（Node 用）
  extend?.(app);

  app.use("*", loadUser);
  app.use("*", messages);

  // アップロードした写真：ログインした人で、見てよい半券の写真だけ
  app.get("/media/*", loginRequired, async (c) => {
    const { repo, storage } = c.var.app;
    const key = decodeURIComponent(c.req.path.slice("/media/".length));
    if (!isSafeKey(key) || !(await repo.photoVisible(key, c.var.user!.id))) return c.notFound();
    const file = await storage.get(key);
    if (!file) return c.notFound();
    return c.body(file.body as ReadableStream, 200, {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=86400",
    });
  });

  app.route("/accounts", accountRoutes());
  app.route("/admin/", adminRoutes()); // 末尾の / まで付けると、一覧の "/" が /admin/ になる
  app.route("/", hankenRoutes());

  app.notFound(async (c) => {
    if (!c.var.app) return c.text("Not Found", 404);
    try {
      return await render(c, <NotFoundPage ctx={await pageCtx(c)} />, 404);
    } catch {
      return c.text("Not Found", 404);
    }
  });
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.text("サーバーでエラーが起きました。時間をおいてもう一度お試しください。", 500);
  });

  return app;
}
