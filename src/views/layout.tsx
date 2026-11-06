/** 全画面共通の枠。Django版の base.html と _ads.html に相当。 */
import type { Child, FC } from "hono/jsx";
import type { Message } from "../auth.ts";
import type { AdPlacement } from "../emotions.ts";
import type { Ad, User } from "../models.ts";

export type Tab = "record" | "mine" | "share" | "calendar" | "recent" | "admin";

/** 画面を描くときに必ず渡すもの */
export interface PageCtx {
  user: User | null;
  messages: Message[];
  ads: (placement: AdPlacement) => Ad[];
  timeZone: string;
  tab?: Tab;
}

export const Ads: FC<{ ctx: PageCtx; placement: AdPlacement }> = ({ ctx, placement }) => {
  const ads = ctx.ads(placement);
  if (!ads.length) return null;
  return (
    <aside class="ads" aria-label="広告">
      {ads.map((ad) => (
        <div class="ad">
          <span class="pr">PR</span>
          <div class="ad-body" dangerouslySetInnerHTML={{ __html: ad.html }} />
        </div>
      ))}
    </aside>
  );
};

const TABS: [Tab, string, string][] = [
  ["record", "/", "記録する"],
  ["mine", "/mine/", "わたしの半券"],
  ["share", "/share/", "みんなの変化"],
  ["calendar", "/calendar/", "カレンダー"],
  ["recent", "/recent/", "最近の作品"],
];

export const Layout: FC<{ ctx: PageCtx; title?: string; children?: Child }> = ({ ctx, title, children }) => {
  const { user, tab } = ctx;
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <title>{title ? `${title}｜感情の半券` : "感情の半券"}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=IBM+Plex+Mono:wght@500&display=swap"
        />
        <link rel="stylesheet" href="/static/hanken/style.css" />
      </head>
      <body>
        <div class="wrap">
          <header class="top">
            <div class="top-row">
              <span class="eyebrow">Before / After of a story</span>
              {user && (
                <form class="userbar" method="post" action="/accounts/logout/">
                  <span class="small muted">{user.username} さん</span>
                  <button class="btn link" type="submit">ログアウト</button>
                </form>
              )}
            </div>
            <h1><a href="/">感情の半券</a></h1>
            <p>本や映画、ドラマに触れる前と後で、気持ちはどう動いた？ 一枚の半券に、作品名と気持ちと写真を残しましょう。</p>
          </header>

          {user && (
            <nav class="tabs" aria-label="画面の切り替え">
              {TABS.map(([key, href, label]) => (
                <a href={href} aria-current={tab === key ? "page" : undefined}>{label}</a>
              ))}
              {user.isStaff && <a href="/admin/" aria-current={tab === "admin" ? "page" : undefined}>管理画面</a>}
            </nav>
          )}

          {ctx.messages.length > 0 && (
            <div class="messages" role="status">
              {ctx.messages.map((m) => <p class={`msg ${m.level}`}>{m.text}</p>)}
            </div>
          )}

          <main class="list">{children}</main>

          <p class="care">
            気持ちの記録は心の整理に役立ちますが、つらさが長く続くときは一人で抱えないでください。身近な人や、
            <a href="https://www.mhlw.go.jp/mamorouyokokoro/soudan/tel" target="_blank" rel="noopener">厚生労働省「まもろうよ こころ」の電話相談窓口</a>
            に相談できます。
          </p>

          <Ads ctx={ctx} placement="footer" />
        </div>
        <script src="/static/hanken/app.js"></script>
      </body>
    </html>
  );
};

/** フィールドのエラー一覧 */
export const Errs: FC<{ list?: string[] }> = ({ list }) =>
  list?.length ? <ul class="errorlist">{list.map((m) => <li>{m}</li>)}</ul> : null;
