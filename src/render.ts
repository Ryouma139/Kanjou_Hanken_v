import type { Context } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./context.ts";
import type { PageCtx, Tab } from "./views/layout.tsx";

/** 画面の共通情報（ログイン中の人・メッセージ・広告）をまとめる */
export async function pageCtx(c: Context<AppEnv>, tab?: Tab): Promise<PageCtx> {
  const { repo, config } = c.var.app;
  const ads = await repo.activeAds();
  return {
    user: c.var.user,
    messages: c.var.messages,
    ads: (placement) => ads.filter((a) => a.placement === placement),
    timeZone: config.timeZone,
    photoMaxSide: config.photoMaxSide,
    tab,
  };
}

/** TSX を HTML として返す */
export async function render(c: Context<AppEnv>, el: JSX.Element, status: ContentfulStatusCode = 200) {
  return c.html(`<!doctype html>${await el}`, status);
}

/** URL の数字 id。数字でなければ null */
export function idParam(c: Context<AppEnv>, name = "id"): number | null {
  const v = c.req.param(name) ?? "";
  return /^\d{1,9}$/.test(v) ? Number(v) : null;
}
