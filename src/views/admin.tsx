/** かんたんな管理画面（作品・広告・半券）。Django版の admin.py の代わり。 */
import type { Child, FC } from "hono/jsx";
import { dotDate } from "../dates.ts";
import { AD_PLACEMENTS, AD_PLACEMENT_NAME, KINDS, SHARE_NAME, type Kind } from "../emotions.ts";
import { emoName, kindName } from "../format.ts";
import type { FormState } from "../forms.ts";
import { coverUrl, type Ad, type Entry, type Work } from "../models.ts";
import { Errs, Layout, type PageCtx } from "./layout.tsx";

const AdminFrame: FC<{ ctx: PageCtx; title: string; crumbs?: [string, string][]; children?: Child }> = ({ ctx, title, crumbs = [], children }) => (
  <Layout ctx={{ ...ctx, tab: "admin" }} title={`${title}｜管理画面`}>
    <nav class="small muted adm-crumbs" aria-label="現在地">
      <a href="/admin/">管理画面</a>
      {crumbs.map(([href, label]) => <> ／ <a href={href}>{label}</a></>)}
      {" ／ "}{title}
    </nav>
    {children}
  </Layout>
);

export const AdminIndex: FC<{ ctx: PageCtx; counts: { works: number; ads: number; entries: number; users: number } }> = ({ ctx, counts }) => (
  <Layout ctx={{ ...ctx, tab: "admin" }} title="管理画面">
    <div class="panel-head"><h2>管理画面</h2><span class="eyebrow">Admin</span></div>
    <div class="adm-cards">
      <a class="panel adm-card" href="/admin/works/"><h3>作品</h3><span class="mono">{counts.works}</span><span class="small muted">「最近の作品」に並ぶ作品と、半券に表示する表紙・リンク</span></a>
      <a class="panel adm-card" href="/admin/ads/"><h3>広告</h3><span class="mono">{counts.ads}</span><span class="small muted">「PR」付きで表示する広告タグ</span></a>
      <a class="panel adm-card" href="/admin/entries/"><h3>半券</h3><span class="mono">{counts.entries}</span><span class="small muted">記録された半券の一覧（{counts.users}人）</span></a>
    </div>
  </Layout>
);

// ---------- 作品 ----------

export const WorkList: FC<{ ctx: PageCtx; works: Work[]; kind?: Kind; q: string }> = ({ ctx, works, kind, q }) => (
  <AdminFrame ctx={ctx} title="作品">
    <div class="actions">
      <a class="btn sm" href="/admin/works/add/">作品を追加</a>
      <form method="get" class="inline">
        <select name="kind" aria-label="種類で絞り込む">
          <option value="">すべての種類</option>
          {KINDS.map(([k, n]) => <option value={k} selected={kind === k}>{n}</option>)}
        </select>
        <input type="text" name="q" value={q} placeholder="作品名で検索" aria-label="作品名で検索" class="adm-search" />
        <button class="btn ghost" type="submit">絞り込む</button>
      </form>
    </div>
    <div class="panel adm-scroll">
      {works.length ? (
        <table class="adm-table">
          <thead><tr><th>画像</th><th>作品名</th><th>種類</th><th>ひとこと紹介</th><th>リンク</th><th>更新日時</th></tr></thead>
          <tbody>
            {works.map((w) => {
              const cover = coverUrl(w);
              return (
                <tr>
                  <td>{cover ? <a href={`/admin/works/${w.id}/`}><img class="adm-thumb" src={cover} alt="" referrerpolicy="no-referrer" /></a> : "—"}</td>
                  <td><a href={`/admin/works/${w.id}/`}>{w.title}</a></td>
                  <td>{kindName(w.kind)}</td>
                  <td class="small">{w.note}</td>
                  <td>{w.url ? "○" : "—"}</td>
                  <td class="mono small">{dotDate(w.updatedAt, ctx.timeZone)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p class="small muted">作品はまだありません。</p>
      )}
    </div>
  </AdminFrame>
);

export const WorkForm: FC<{ ctx: PageCtx; work: Work | null; form: FormState }> = ({ ctx, work, form }) => {
  const v = form.values;
  const cover = coverUrl(work);
  return (
    <AdminFrame ctx={ctx} title={work ? work.title : "作品を追加"} crumbs={[["/admin/works/", "作品"]]}>
      <form method="post" enctype="multipart/form-data" class="panel" novalidate>
        <label class="field" for="id_kind">
          種類
          <select name="kind" id="id_kind">
            <option value="">---------</option>
            {KINDS.map(([k, n]) => <option value={k} selected={v.kind === k}>{n}</option>)}
          </select>
        </label>
        <Errs list={form.errors.kind} />
        <label class="field" for="id_title">
          作品名<input type="text" name="title" id="id_title" maxlength={80} value={v.title ?? ""} />
        </label>
        <Errs list={form.errors.title} />
        <label class="field" for="id_note">
          ひとこと紹介<input type="text" name="note" id="id_note" maxlength={120} value={v.note ?? ""} />
        </label>
        <Errs list={form.errors.note} />
        <label class="field" for="id_url">
          リンク<input type="text" inputmode="url" name="url" id="id_url" maxlength={200} value={v.url ?? ""} />
        </label>
        <span class="help small muted">公式サイト、配信ページ、書籍の販売ページなど。空なら作品名はリンクになりません。</span>
        <Errs list={form.errors.url} />

        <div class="field">
          画像
          <div class="photo-row">
            <div class="photo-prev" data-preview-for="id_image"></div>
            <div class="photo-side">
              <label class="filebtn"><input type="file" name="image" id="id_image" accept="image/*" data-max-side={800} />画像を選ぶ</label>
              {work?.image && (
                <label class="check small"><input type="checkbox" name="image_clear" /> アップロードした画像を削除する</label>
              )}
            </div>
          </div>
        </div>
        <span class="help small muted">表紙やポスターなど。縦長（2:3）がきれいに収まります。選ぶと長辺800pxに縮小してから送ります。</span>
        <Errs list={form.errors.image} />

        <label class="field" for="id_image_url">
          画像URL<input type="text" inputmode="url" name="image_url" id="id_image_url" maxlength={500} value={v.image_url ?? ""} />
        </label>
        <span class="help small muted">ほかのサイトの画像アドレス。上の「画像」をアップロードしている場合は、そちらが優先されます。</span>
        <Errs list={form.errors.image_url} />

        {work && (
          <div class="field">
            いま表示される画像
            {cover ? (
              <div>
                <img class="adm-preview" src={cover} alt="" referrerpolicy="no-referrer" /><br />
                <span class="small muted">{work.image ? "アップロードした画像" : "画像URL"}を表示中</span>
              </div>
            ) : (
              <span class="small muted">なし（種類の色で表示）</span>
            )}
          </div>
        )}

        <div class="actions">
          <button class="btn" type="submit">保存</button>
          <a class="btn ghost" href="/admin/works/">やめる</a>
          {work && <a class="btn danger" href={`/admin/works/${work.id}/delete/`}>削除</a>}
          {Object.keys(form.errors).length > 0 && <span class="status err">入力内容を確認してください。</span>}
        </div>
      </form>
    </AdminFrame>
  );
};

// ---------- 広告 ----------

export const AdList: FC<{ ctx: PageCtx; ads: Ad[] }> = ({ ctx, ads }) => (
  <AdminFrame ctx={ctx} title="広告">
    <div class="actions"><a class="btn sm" href="/admin/ads/add/">広告を追加</a></div>
    <div class="panel adm-scroll">
      {ads.length ? (
        <table class="adm-table">
          <thead><tr><th>管理用の名前</th><th>表示する場所</th><th>表示</th><th>並び順</th><th>更新日時</th></tr></thead>
          <tbody>
            {ads.map((a) => (
              <tr>
                <td><a href={`/admin/ads/${a.id}/`}>{a.name}</a></td>
                <td>{AD_PLACEMENT_NAME[a.placement]}</td>
                <td>{a.isActive ? "○" : "—"}</td>
                <td class="mono">{a.order}</td>
                <td class="mono small">{dotDate(a.updatedAt, ctx.timeZone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="small muted">広告はまだありません。</p>
      )}
    </div>
  </AdminFrame>
);

export const AdForm: FC<{ ctx: PageCtx; ad: Ad | null; form: FormState }> = ({ ctx, ad, form }) => {
  const v = form.values;
  return (
    <AdminFrame ctx={ctx} title={ad ? ad.name : "広告を追加"} crumbs={[["/admin/ads/", "広告"]]}>
      <form method="post" class="panel" novalidate>
        <label class="field" for="id_name">
          管理用の名前<input type="text" name="name" id="id_name" maxlength={80} value={v.name ?? ""} />
        </label>
        <span class="help small muted">画面には出ません。どの広告か見分けるための名前です。</span>
        <Errs list={form.errors.name} />
        <label class="field" for="id_placement">
          表示する場所
          <select name="placement" id="id_placement">
            {AD_PLACEMENTS.map(([k, n]) => <option value={k} selected={(v.placement || "footer") === k}>{n}</option>)}
          </select>
        </label>
        <Errs list={form.errors.placement} />
        <label class="field" for="id_html">
          広告タグ（HTML）<textarea name="html" id="id_html" rows={6} class="mono">{v.html ?? ""}</textarea>
        </label>
        <span class="help small muted">A8.net などの広告タグを、改変せずそのまま貼り付けてください。「PR」の表示は自動で付きます。HTML はそのままページに出るので、信頼できるタグだけを入れてください。</span>
        <Errs list={form.errors.html} />
        <label class="check"><input type="checkbox" name="is_active" checked={v.is_active === "on"} /> 表示する</label>
        <label class="field" for="id_order">
          並び順<input type="text" inputmode="numeric" name="order" id="id_order" value={v.order ?? "0"} />
        </label>
        <span class="help small muted">同じ場所に複数あるとき、小さいほど先に表示します。</span>
        <Errs list={form.errors.order} />
        <div class="actions">
          <button class="btn" type="submit">保存</button>
          <a class="btn ghost" href="/admin/ads/">やめる</a>
          {ad && <a class="btn danger" href={`/admin/ads/${ad.id}/delete/`}>削除</a>}
          {Object.keys(form.errors).length > 0 && <span class="status err">入力内容を確認してください。</span>}
        </div>
      </form>
    </AdminFrame>
  );
};

// ---------- 半券 ----------

export const EntryList: FC<{ ctx: PageCtx; entries: Entry[] }> = ({ ctx, entries }) => (
  <AdminFrame ctx={ctx} title="半券">
    <div class="panel adm-scroll">
      {entries.length ? (
        <table class="adm-table">
          <thead>
            <tr><th>作品名</th><th>種類</th><th>作品</th><th>記録した人</th><th>観る前</th><th>観た後</th><th>共有</th><th>作成日時</th><th></th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr>
                <td>{e.title}</td>
                <td>{kindName(e.kind)}</td>
                <td>{e.work ? <a href={`/admin/works/${e.work.id}/`}>{e.work.title}</a> : "—"}</td>
                <td>{e.user?.username}</td>
                <td>{emoName(e.beforeEmo)} <span class="mono">{e.beforeMood}</span></td>
                <td>{e.afterEmo ? <>{emoName(e.afterEmo)} <span class="mono">{e.afterMood}</span></> : "—"}</td>
                <td>{SHARE_NAME[e.share]}</td>
                <td class="mono small">{dotDate(e.createdAt, ctx.timeZone)}</td>
                <td><a class="small" href={`/admin/entries/${e.id}/delete/`}>削除</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="small muted">半券はまだありません。</p>
      )}
    </div>
  </AdminFrame>
);

// ---------- 削除の確認 ----------

export const ConfirmDelete: FC<{ ctx: PageCtx; what: string; name: string; back: string; crumbs: [string, string][] }> = ({ ctx, what, name, back, crumbs }) => (
  <AdminFrame ctx={ctx} title="削除の確認" crumbs={crumbs}>
    <form method="post" class="panel">
      <p>{what}「{name}」を削除しますか？ この操作は取り消せません。</p>
      <div class="actions">
        <button class="btn danger" type="submit">削除する</button>
        <a class="btn ghost" href={back}>やめる</a>
      </div>
    </form>
  </AdminFrame>
);
