/** 管理画面（スタッフだけ） */
import { Hono, type Context } from "hono";
import { flash, staffRequired } from "../auth.ts";
import type { AppEnv } from "../context.ts";
import { isKind } from "../emotions.ts";
import { validateAd, validateWork, type FormState } from "../forms.ts";
import type { Ad, Work } from "../models.ts";
import { deleteMedia, saveMedia } from "../photos.ts";
import { idParam, pageCtx, render } from "../render.ts";
import { AdForm, AdList, AdminIndex, ConfirmDelete, EntryList, WorkForm, WorkList } from "../views/admin.tsx";

const workValues = (w: Work): FormState["values"] => ({
  kind: w.kind, title: w.title, note: w.note, url: w.url, image_url: w.imageUrl,
});

const adValues = (a: Ad): FormState["values"] => ({
  name: a.name, placement: a.placement, html: a.html, is_active: a.isActive ? "on" : "", order: String(a.order),
});

export function adminRoutes() {
  const app = new Hono<AppEnv>();
  app.use("*", staffRequired);

  app.get("/", (c) => {
    const { db } = c.var.app.repo;
    const n = (t: string) => Number((db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n);
    return render(c, <AdminIndex ctx={pageCtx(c)} counts={{ works: n("works"), ads: n("ads"), entries: n("entries"), users: n("users") }} />);
  });

  // ----- 作品 -----

  app.get("/works/", (c) => {
    const kind = c.req.query("kind");
    const q = (c.req.query("q") ?? "").trim();
    const k = isKind(kind) ? kind : undefined;
    return render(c, <WorkList ctx={pageCtx(c)} works={c.var.app.repo.works({ kind: k, q })} kind={k} q={q} />);
  });

  app.get("/works/add/", (c) => {
    const kind = c.req.query("kind");
    return render(c, <WorkForm ctx={pageCtx(c)} work={null} form={{ values: { kind: isKind(kind) ? kind : "" }, errors: {} }} />);
  });

  app.get("/works/:id/", (c) => {
    const w = c.var.app.repo.work(idParam(c) ?? 0);
    if (!w) return c.notFound();
    return render(c, <WorkForm ctx={pageCtx(c)} work={w} form={{ values: workValues(w), errors: {} }} />);
  });

  const saveWork = async (c: Context<AppEnv>, work: Work | null) => {
    const { repo, config } = c.var.app;
    const r = await validateWork(await c.req.parseBody(), config, (k, t) => repo.workExists(k, t, work?.id));
    if (!r.ok) return render(c, <WorkForm ctx={pageCtx(c)} work={work} form={r.state} />);
    const d = r.data;
    let image = work?.image ?? "";
    const old = image;
    if (d.image) image = await saveMedia(config.mediaRoot, `works/${d.kind}`, d.image);
    else if (d.clearImage) image = "";
    const saved = repo.saveWork({ kind: d.kind, title: d.title, note: d.note, url: d.url, imageUrl: d.imageUrl, image }, work?.id);
    if (old && old !== image) await deleteMedia(config.mediaRoot, old);
    // まだ作品に結びついていない同名の半券を結びつける
    repo.linkEntriesToWorks(saved.title);
    flash(c, `作品「${saved.title}」を保存しました。`);
    return c.redirect("/admin/works/");
  };

  app.post("/works/add/", (c) => saveWork(c, null));
  app.post("/works/:id/", (c) => {
    const w = c.var.app.repo.work(idParam(c) ?? 0);
    return w ? saveWork(c, w) : c.notFound();
  });

  app.get("/works/:id/delete/", (c) => {
    const w = c.var.app.repo.work(idParam(c) ?? 0);
    if (!w) return c.notFound();
    return render(c, <ConfirmDelete ctx={pageCtx(c)} what="作品" name={w.title} back={`/admin/works/${w.id}/`} crumbs={[["/admin/works/", "作品"]]} />);
  });

  app.post("/works/:id/delete/", async (c) => {
    const { repo, config } = c.var.app;
    const w = repo.work(idParam(c) ?? 0);
    if (!w) return c.notFound();
    repo.deleteWork(w.id);
    await deleteMedia(config.mediaRoot, w.image);
    flash(c, `作品「${w.title}」を削除しました。`);
    return c.redirect("/admin/works/");
  });

  // ----- 広告 -----

  app.get("/ads/", (c) => render(c, <AdList ctx={pageCtx(c)} ads={c.var.app.repo.ads()} />));

  app.get("/ads/add/", (c) =>
    render(c, <AdForm ctx={pageCtx(c)} ad={null} form={{ values: { placement: "footer", is_active: "on", order: "0" }, errors: {} }} />),
  );

  app.get("/ads/:id/", (c) => {
    const a = c.var.app.repo.ad(idParam(c) ?? 0);
    if (!a) return c.notFound();
    return render(c, <AdForm ctx={pageCtx(c)} ad={a} form={{ values: adValues(a), errors: {} }} />);
  });

  const saveAd = async (c: Context<AppEnv>, ad: Ad | null) => {
    const r = validateAd(await c.req.parseBody());
    if (!r.ok) return render(c, <AdForm ctx={pageCtx(c)} ad={ad} form={r.state} />);
    const saved = c.var.app.repo.saveAd(r.data, ad?.id);
    flash(c, `広告「${saved.name}」を保存しました。`);
    return c.redirect("/admin/ads/");
  };

  app.post("/ads/add/", (c) => saveAd(c, null));
  app.post("/ads/:id/", (c) => {
    const a = c.var.app.repo.ad(idParam(c) ?? 0);
    return a ? saveAd(c, a) : c.notFound();
  });

  app.get("/ads/:id/delete/", (c) => {
    const a = c.var.app.repo.ad(idParam(c) ?? 0);
    if (!a) return c.notFound();
    return render(c, <ConfirmDelete ctx={pageCtx(c)} what="広告" name={a.name} back={`/admin/ads/${a.id}/`} crumbs={[["/admin/ads/", "広告"]]} />);
  });

  app.post("/ads/:id/delete/", (c) => {
    const a = c.var.app.repo.ad(idParam(c) ?? 0);
    if (!a) return c.notFound();
    c.var.app.repo.deleteAd(a.id);
    flash(c, `広告「${a.name}」を削除しました。`);
    return c.redirect("/admin/ads/");
  });

  // ----- 半券 -----

  app.get("/entries/", (c) => render(c, <EntryList ctx={pageCtx(c)} entries={c.var.app.repo.allEntries()} />));

  app.get("/entries/:id/delete/", (c) => {
    const e = c.var.app.repo.entry(idParam(c) ?? 0);
    if (!e) return c.notFound();
    return render(c, <ConfirmDelete ctx={pageCtx(c)} what="半券" name={e.title} back="/admin/entries/" crumbs={[["/admin/entries/", "半券"]]} />);
  });

  app.post("/entries/:id/delete/", async (c) => {
    const { repo, config } = c.var.app;
    const e = repo.entry(idParam(c) ?? 0);
    if (!e) return c.notFound();
    repo.deleteEntry(e.id);
    await deleteMedia(config.mediaRoot, e.beforePhoto);
    await deleteMedia(config.mediaRoot, e.afterPhoto);
    flash(c, `半券「${e.title}」を削除しました。`);
    return c.redirect("/admin/entries/");
  });

  return app;
}
