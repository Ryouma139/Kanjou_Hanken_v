/** ログイン・ログアウト・登録 */
import { Hono } from "hono";
import { checkPassword, hashPassword, login, logout, safeNext } from "../auth.ts";
import type { AppEnv } from "../context.ts";
import { validateSignup } from "../forms.ts";
import { pageCtx, render } from "../render.ts";
import { LoginPage, SignupPage } from "../views/auth.tsx";

const AFTER_LOGIN = "/recent/";

// ユーザーがいないときも同じくらい時間をかける（名前の有無を推測されにくくする）
let dummyHash: Promise<string> | null = null;

export function accountRoutes() {
  const app = new Hono<AppEnv>();

  app.get("/login/", async (c) =>
    render(c, <LoginPage ctx={await pageCtx(c)} username="" next={c.req.query("next") ?? ""} failed={false} />),
  );

  app.post("/login/", async (c) => {
    const body = await c.req.parseBody();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const next = typeof body.next === "string" ? body.next : "";
    const user = username ? await c.var.app.repo.userByName(username) : null;
    const ok = user
      ? await checkPassword(password, user.password)
      : (await checkPassword(password, await (dummyHash ??= hashPassword("dummy-password"))), false);
    if (!user || !ok) {
      return render(c, <LoginPage ctx={await pageCtx(c)} username={username} next={next} failed />);
    }
    await login(c, user);
    return c.redirect(safeNext(next, AFTER_LOGIN));
  });

  app.post("/logout/", async (c) => {
    await logout(c);
    return c.redirect("/accounts/login/");
  });

  app.get("/signup/", async (c) => {
    if (c.var.user) return c.redirect("/");
    return render(c, <SignupPage ctx={await pageCtx(c)} form={{ values: {}, errors: {} }} />);
  });

  app.post("/signup/", async (c) => {
    if (c.var.user) return c.redirect("/");
    const { repo } = c.var.app;
    const r = await validateSignup(await c.req.parseBody(), async (name) => !!(await repo.userByName(name)));
    if (!r.ok) return render(c, <SignupPage ctx={await pageCtx(c)} form={r.state} />);
    const user = await repo.createUser(r.data.username, await hashPassword(r.data.password));
    await login(c, user);
    return c.redirect(AFTER_LOGIN);
  });

  return app;
}
