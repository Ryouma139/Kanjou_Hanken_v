/** 半券まわりの画面。Django版の views.py（hanken）と urls.py に相当。 */
import { Hono, type Context } from "hono";
import * as analysis from "../analysis.ts";
import { flash, loginRequired } from "../auth.ts";
import type { AppEnv } from "../context.ts";
import { localDate, makeDate, sameDay, shiftMonth, ym } from "../dates.ts";
import { KIND_NAME, SHARE_NAME, isEmotion, type Emotion, type Kind } from "../emotions.ts";
import { RECORD_INITIAL, validateAfter, validateRecord, validateShare, type FormState } from "../forms.ts";
import { delta, finishedOn, isDone, type Entry, type User } from "../models.ts";
import { deleteImage, photoDir, saveImage, type ImageFile } from "../photos.ts";
import { idParam, pageCtx, render } from "../render.ts";
import { AfterPage, CalendarPage, MinePage, RecentPage, RecordPage, ReflectPage, SharePage } from "../views/pages.tsx";

const RECENT_KINDS: Kind[] = ["movie", "book", "drama"];
const RECENT_LIMIT = 10;

/** みんなの画面で表示する名前 */
export function authorLabel(e: Entry, viewer: User): string {
  if (e.userId === viewer.id) return e.share === "anon" ? "あなた（匿名で共有）" : "あなた";
  if (e.share === "anon") return "匿名さん";
  return e.user?.fullName || e.user?.username || "";
}

/** 自分の画面で表示する共有の状態 */
export function ownLabel(e: Entry): string {
  return e.share === "private" ? "自分だけ" : e.share === "anon" ? "匿名で共有中" : "共有中";
}

const emptyForm = (values: Record<string, string> = {}): FormState => ({ values, errors: {} });

export function hankenRoutes() {
  const app = new Hono<AppEnv>();
  app.use("*", loginRequired);

  const me = (c: Context<AppEnv>) => c.var.user!;

  /** 自分の半券を URL の id から。なければ null（＝404） */
  const ownEntry = async (c: Context<AppEnv>) => {
    const id = idParam(c);
    return id == null ? null : c.var.app.repo.ownEntry(id, me(c).id);
  };

  // ----- 記録する -----

  app.get("/", async (c) => render(c, <RecordPage ctx={await pageCtx(c, "record")} form={emptyForm({ ...RECORD_INITIAL })} />));

  app.post("/", async (c) => {
    const { repo, config, storage } = c.var.app;
    const r = await validateRecord(await c.req.parseBody(), config);
    if (!r.ok) return render(c, <RecordPage ctx={await pageCtx(c, "record")} form={r.state} />);

    const { kind, title, share, before, after } = r.data;
    const now = new Date();
    const at = now.toISOString();
    const save = (img: ImageFile | null) => (img ? saveImage(storage, photoDir(now), img) : Promise.resolve(""));
    const entry = await repo.insertEntry(
      {
        userId: me(c).id,
        workId: (await repo.matchWork(kind, title))?.id ?? null,
        kind, title, share,
        beforeEmo: before.emo, beforeMood: before.mood, beforeNote: before.note,
        beforePhoto: await save(before.photo), beforeAt: at,
        afterEmo: after?.emo ?? "", afterMood: after?.mood ?? null, afterNote: after?.note ?? "",
        afterPhoto: await save(after?.photo ?? null), afterAt: after ? at : null,
      },
      at,
    );
    if (isDone(entry)) return c.redirect(`/entry/${entry.id}/reflect/`);
    flash(c, "観る前の気持ちを記録しました。観終わったら「わたしの半券」から続きを記録できます。");
    return c.redirect("/");
  });

  // ----- 観た後を記録 -----

  app.get("/entry/:id/after/", async (c) => {
    const entry = await ownEntry(c);
    if (!entry) return c.notFound();
    const values: Record<string, string> = isDone(entry)
      ? { after_emo: entry.afterEmo, after_mood: String(entry.afterMood ?? 5), after_note: entry.afterNote }
      : { after_mood: "5" };
    return render(c, <AfterPage ctx={await pageCtx(c, "record")} entry={entry} form={emptyForm(values)} />);
  });

  app.post("/entry/:id/after/", async (c) => {
    const { repo, config, storage } = c.var.app;
    const entry = await ownEntry(c);
    if (!entry) return c.notFound();
    const r = await validateAfter(await c.req.parseBody(), config);
    if (!r.ok) return render(c, <AfterPage ctx={await pageCtx(c, "record")} entry={entry} form={r.state} />);

    let photo = entry.afterPhoto;
    if (r.data.photo) {
      photo = await saveImage(storage, photoDir(), r.data.photo);
      await deleteImage(storage, entry.afterPhoto);
    }
    await repo.saveAfter(entry.id, {
      afterEmo: r.data.emo, afterMood: r.data.mood, afterNote: r.data.note,
      afterPhoto: photo, afterAt: new Date().toISOString(),
    });
    return c.redirect(`/entry/${entry.id}/reflect/`);
  });

  // ----- ふり返り -----

  app.get("/entry/:id/reflect/", async (c) => {
    const entry = await ownEntry(c);
    if (!entry) return c.notFound();
    if (!isDone(entry)) return c.redirect(`/entry/${entry.id}/after/`);
    return render(
      c,
      <ReflectPage ctx={await pageCtx(c, "record")} entry={entry} author={ownLabel(entry)} care={analysis.careLine(delta(entry)!)} />,
    );
  });

  // ----- 共有の変更・削除 -----

  app.post("/entry/:id/share/", async (c) => {
    const entry = await ownEntry(c);
    if (!entry) return c.notFound();
    const share = validateShare(await c.req.parseBody());
    if (share) {
      await c.var.app.repo.setShare(entry.id, share);
      flash(c, `『${entry.title}』の共有を「${SHARE_NAME[share]}」にしました。`);
    }
    return c.redirect(`/mine/#e${entry.id}`);
  });

  app.post("/entry/:id/delete/", async (c) => {
    const { repo, storage } = c.var.app;
    const entry = await ownEntry(c);
    if (!entry) return c.notFound();
    await repo.deleteEntry(entry.id);
    await deleteImage(storage, entry.beforePhoto);
    await deleteImage(storage, entry.afterPhoto);
    flash(c, `『${entry.title}』の半券を削除しました。`);
    return c.redirect("/mine/");
  });

  // ----- わたしの半券 -----

  app.get("/mine/", async (c) => {
    const entries = await c.var.app.repo.userEntries(me(c).id);
    const done = entries.filter(isDone);
    const label = (e: Entry) => ({ e, author: ownLabel(e) });
    return render(
      c,
      <MinePage
        ctx={await pageCtx(c, "mine")}
        count={entries.length}
        open={entries.filter((e) => !isDone(e)).map(label)}
        done={done.map(label)}
        stats={analysis.summarize(done)}
        comfort={analysis.comfortWorks(done)}
        chart={analysis.slopeChart(done)}
        confirm={c.req.query("confirm") ?? ""}
      />,
    );
  });

  // ----- 最近の作品 -----

  app.get("/recent/", async (c) => {
    const { repo } = c.var.app;
    const sections = await Promise.all(
      RECENT_KINDS.map(async (k) => ({ kind: k, name: KIND_NAME[k], works: await repo.recentWorks(k, RECENT_LIMIT) })),
    );
    return render(c, <RecentPage ctx={await pageCtx(c, "recent")} sections={sections} />);
  });

  // ----- カレンダー -----

  app.get("/calendar/", async (c) => {
    const { repo, config } = c.var.app;
    const tz = config.timeZone;
    const today = localDate(new Date(), tz);

    let { year, month } = today;
    const m = /^(\d{1,4})-(\d{1,2})$/.exec((c.req.query("m") ?? "").trim());
    if (m && makeDate(Number(m[1]), Number(m[2]), 1)) [year, month] = [Number(m[1]), Number(m[2])];

    const entries = await repo.userDoneEntries(me(c).id);
    const d = (c.req.query("d") ?? "").trim();
    const picked = /^\d{1,2}$/.test(d) ? makeDate(year, month, Number(d)) : null;
    const dayEntries = picked
      ? entries.filter((e) => sameDay(finishedOn(e, tz), picked)).map((e) => ({ e: e as Entry, author: ownLabel(e) }))
      : [];

    return render(
      c,
      <CalendarPage
        ctx={await pageCtx(c, "calendar")}
        year={year}
        month={month}
        ym={ym(year, month)}
        prev={ym(...shiftMonth(year, month, -1))}
        next={ym(...shiftMonth(year, month, 1))}
        isThisMonth={year === today.year && month === today.month}
        cal={analysis.monthCalendar(entries, year, month, tz, today)}
        picked={picked}
        dayEntries={dayEntries}
      />,
    );
  });

  // ----- みんなの変化 -----

  app.get("/share/", async (c) => {
    const { repo } = c.var.app;
    const user = me(c);
    const pool = await repo.sharedDoneEntries();
    const ctx = await pageCtx(c, "share");
    if (!pool.length) return render(c, <SharePage ctx={ctx} total={0} />);

    const counts = analysis.beforeCounts(pool);
    const available = new Set<Emotion>(counts.map((x) => x.key));
    const q = c.req.query("emo");
    let sel: Emotion;
    if (isEmotion(q) && available.has(q)) {
      sel = q;
    } else {
      // 自分が最近記録した気持ち、なければいちばん多い気持ち
      sel = (await repo.latestBeforeEmo(user.id, [...available])) ?? counts.reduce((a, b) => (b.n > a.n ? b : a)).key;
    }

    const group = pool.filter((e) => e.beforeEmo === sel);
    const recent = [...group]
      .sort((a, b) => (b.afterAt ?? b.createdAt).localeCompare(a.afterAt ?? a.createdAt))
      .slice(0, 6)
      .map((e) => ({ e: e as Entry, author: authorLabel(e, user) }));

    return render(
      c,
      <SharePage
        ctx={ctx}
        total={pool.length}
        counts={counts}
        sel={sel}
        stats={analysis.summarize(group)}
        dist={analysis.afterDistribution(group)}
        works={analysis.workRanking(group)}
        recent={recent}
      />,
    );
  });

  return app;
}
