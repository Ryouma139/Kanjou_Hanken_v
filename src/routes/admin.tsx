/** 管理画面（スタッフだけ） */
import { Hono, type Context } from "hono";
import { flash, staffRequired } from "../auth.ts";
import type { AppEnv } from "../context.ts";
import { isKind } from "../emotions.ts";
import { validateAd, validateWork, type FormState } from "../forms.ts";
import type { Ad, Work } from "../models.ts";
import { deleteImage, saveImage } from "../photos.ts";
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

  const workOf = (c: Context<AppEnv>) => c.var.app.repo.work(idParam(c) ?? 0);
  const adOf = (c: Context<AppEnv>) => c.var.app.repo.ad(idParam(c) ?? 0);

  app.get("/", async (c) => {
    const { repo } = c.var.app;
    const [works, ads, entries, users] = await Promise.all([repo.count("works"), repo.count("ads"), repo.count("entries"), repo.count("users")]);
    return render(c, <AdminIndex ctx={await pageCtx(c)} counts={{ works, ads, entries, users }} />);
  });

  // ----- 作品 -----

  app.get("/works/", async (c) => {
    const kind = c.req.query("kind");
    const q = (c.req.query("q") ?? "").trim();
    const k = isKind(kind) ? kind : undefined;
    return render(c, <WorkList ctx={await pageCtx(c)} works={await c.var.app.repo.works({ kind: k, q })} kind={k} q={q} />);
  });

  app.get("/works/add/", async (c) => {
    const kind = c.req.query("kind");
    return render(c, <WorkForm ctx={await pageCtx(c)} work={null} form={{ values: { kind: isKind(kind) ? kind : "" }, errors: {} }} />);
  });

  app.get("/works/:id/", async (c) => {
    const w = await workOf(c);
    if (!w) return c.notFound();
    return render(c, <WorkForm ctx={await pageCtx(c)} work={w} form={{ values: workValues(w), errors: {} }} />);
  });

  const saveWork = async (c: Context<AppEnv>, work: Work | null) => {
    const { repo, config, storage } = c.var.app;
    const r = await validateWork(await c.req.parseBody(), config, (k, t) => repo.workExists(k, t, work?.id));
    if (!r.ok) return render(c, <WorkForm ctx={await pageCtx(c)} work={work} form={r.state} />);
    const d = r.data;
    const old = work?.image ?? "";
    let image = old;
    if (d.image) image = await saveImage(storage, `works/${d.kind}`, d.image);
    else if (d.clearImage) image = "";
    const saved = await repo.saveWork({ kind: d.kind, title: d.title, note: d.note, url: d.url, imageUrl: d.imageUrl, image }, work?.id);
    if (old && old !== image) await deleteImage(storage, old);
    // まだ作品に結びついていない同名の半券を結びつける
    await repo.linkEntriesToWorks(saved.title);
    flash(c, `作品「${saved.title}」を保存しました。`);
    return c.redirect("/admin/works/");
  };

  app.post("/works/add/", (c) => saveWork(c, null));
  app.post("/works/:id/", async (c) => {
    const w = await workOf(c);
    return w ? saveWork(c, w) : c.notFound();
  });

  app.get("/works/:id/delete/", async (c) => {
    const w = await workOf(c);
    if (!w) return c.notFound();
    return render(c, <ConfirmDelete ctx={await pageCtx(c)} what="作品" name={w.title} back={`/admin/works/${w.id}/`} crumbs={[["/admin/works/", "作品"]]} />);
  });

  app.post("/works/:id/delete/", async (c) => {
    const { repo, storage } = c.var.app;
    const w = await workOf(c);
    if (!w) return c.notFound();
    await repo.deleteWork(w.id);
    await deleteImage(storage, w.image);
    flash(c, `作品「${w.title}」を削除しました。`);
    return c.redirect("/admin/works/");
  });

  // ----- 広告 -----

  app.get("/ads/", async (c) => render(c, <AdList ctx={await pageCtx(c)} ads={await c.var.app.repo.ads()} />));

  app.get("/ads/add/", async (c) =>
    render(c, <AdForm ctx={await pageCtx(c)} ad={null} form={{ values: { placement: "footer", is_active: "on", order: "0" }, errors: {} }} />),
  );

  app.get("/ads/:id/", async (c) => {
    const a = await adOf(c);
    if (!a) return c.notFound();
    return render(c, <AdForm ctx={await pageCtx(c)} ad={a} form={{ values: adValues(a), errors: {} }} />);
  });

  const saveAd = async (c: Context<AppEnv>, ad: Ad | null) => {
    const r = validateAd(await c.req.parseBody());
    if (!r.ok) return render(c, <AdForm ctx={await pageCtx(c)} ad={ad} form={r.state} />);
    const saved = await c.var.app.repo.saveAd(r.data, ad?.id);
    flash(c, `広告「${saved.name}」を保存しました。`);
    return c.redirect("/admin/ads/");
  };

  app.post("/ads/add/", (c) => saveAd(c, null));
  app.post("/ads/:id/", async (c) => {
    const a = await adOf(c);
    return a ? saveAd(c, a) : c.notFound();
  });

  app.get("/ads/:id/delete/", async (c) => {
    const a = await adOf(c);
    if (!a) return c.notFound();
    return render(c, <ConfirmDelete ctx={await pageCtx(c)} what="広告" name={a.name} back={`/admin/ads/${a.id}/`} crumbs={[["/admin/ads/", "広告"]]} />);
  });

  app.post("/ads/:id/delete/", async (c) => {
    const a = await adOf(c);
    if (!a) return c.notFound();
    await c.var.app.repo.deleteAd(a.id);
    flash(c, `広告「${a.name}」を削除しました。`);
    return c.redirect("/admin/ads/");
  });

  // ----- 半券 -----

  app.get("/entries/", async (c) => render(c, <EntryList ctx={await pageCtx(c)} entries={await c.var.app.repo.allEntries()} />));

  app.get("/entries/:id/delete/", async (c) => {
    const e = await c.var.app.repo.entry(idParam(c) ?? 0);
    if (!e) return c.notFound();
    return render(c, <ConfirmDelete ctx={await pageCtx(c)} what="半券" name={e.title} back="/admin/entries/" crumbs={[["/admin/entries/", "半券"]]} />);
  });

  app.post("/entries/:id/delete/", async (c) => {
    const { repo, storage } = c.var.app;
    const e = await repo.entry(idParam(c) ?? 0);
    if (!e) return c.notFound();
    await repo.deleteEntry(e.id);
    await deleteImage(storage, e.beforePhoto);
    await deleteImage(storage, e.afterPhoto);
    flash(c, `半券「${e.title}」を削除しました。`);
    return c.redirect("/admin/entries/");
  });

  return app;
}
