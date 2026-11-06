import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import sharp from "sharp";
import { localDate, ym } from "../src/dates.ts";
import { coverUrl } from "../src/models.ts";
import { Client, location, make, png, setup } from "./helpers.ts";

describe("画面", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let client: Client;

  beforeEach(async () => {
    t = await setup();
    client = t.client();
    await client.login("a");
  });
  afterEach(() => t.cleanup());

  const makeStaff = (id: number) => t.repo.db.prepare("UPDATE users SET is_staff = 1 WHERE id = ?").run(id);

  it("ログインしていなければログイン画面へ", async () => {
    const r = await t.client().get("/mine/");
    assert.equal(r.status, 302);
    assert.equal(location(r), "/accounts/login/?next=%2Fmine%2F");
  });

  it("観る前を記録してから、観た後を記録する", async () => {
    let r = await client.post("/", {
      kind: "book", title: "西の魔女が死んだ", before_emo: "tired", before_mood: 3, share: "anon", before_photo: await png(),
    });
    assert.equal(location(r), "/");
    const [e] = t.repo.userEntries(t.a.id);
    assert.ok(e);
    assert.equal(e.afterEmo, "");
    assert.match(e.beforePhoto, /^photos\/\d{4}\/\d{2}\/[0-9a-f]{32}\.jpg$/);
    const meta = await sharp(path.join(t.mediaRoot, e.beforePhoto)).metadata();
    assert.equal(Math.max(meta.width!, meta.height!), 1280);
    assert.equal(meta.format, "jpeg");
    assert.match((await client.text("/")).body, /観る前の気持ちを記録しました/);

    r = await client.post(`/entry/${e.id}/after/`, { after_emo: "calm", after_mood: 8 });
    assert.equal(location(r), `/entry/${e.id}/reflect/`);
    const done = t.repo.entry(e.id)!;
    assert.equal(done.afterMood! - done.beforeMood, 5);
    assert.match((await client.text(`/entry/${e.id}/reflect/`)).body, /\+5/);

    // 写真はログインした人にだけ配信
    assert.equal((await client.get(`/media/${e.beforePhoto}`)).status, 200);
    assert.equal((await t.client().get(`/media/${e.beforePhoto}`)).status, 302);
  });

  it("「もう観終わった」なら観た後の気持ちも必須", async () => {
    const r = await client.post("/", {
      kind: "movie", title: "T", before_emo: "sad", before_mood: 4, both: "on", after_mood: 6, share: "public",
    });
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.match(body, /観た後の気持ちも一つ選んでください。/);
    assert.match(body, /id="after-panel"(?! hidden)/);
    assert.equal(t.repo.allEntries().length, 0);
  });

  it("前と後を一度に記録するとふり返りへ", async () => {
    const r = await client.post("/", {
      kind: "movie", title: "T", before_emo: "sad", before_mood: 4, both: "on", after_emo: "joy", after_mood: 6, share: "public",
    });
    const [e] = t.repo.userEntries(t.a.id);
    assert.equal(location(r), `/entry/${e!.id}/reflect/`);
  });

  it("画像でないファイルや大きすぎる写真は受け付けない", async () => {
    const r = await client.post("/", {
      kind: "book", title: "X", before_emo: "sad", before_mood: 4, share: "public",
      before_photo: new Blob(["not an image"], { type: "image/png" }),
    });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /画像でないか、または壊れています/);
    assert.equal(t.repo.allEntries().length, 0);
  });

  it("みんなの変化：自分だけの半券は出さず、匿名は匿名さん", async () => {
    make(t.repo, t.b, "公開作品", "anxious", 3, "calm", 7, "public");
    make(t.repo, t.b, "匿名作品", "anxious", 3, "joy", 8, "anon");
    make(t.repo, t.b, "秘密作品", "anxious", 3, "joy", 9, "private");
    const { body } = await client.text("/share/?emo=anxious");
    assert.match(body, /公開作品/);
    assert.match(body, /匿名さん/);
    assert.doesNotMatch(body, /秘密作品/);
    assert.match(body, /<div class="v mono">2<\/div><div class="k">半券<\/div>/);
  });

  it("他人の半券には触れない", async () => {
    const e = make(t.repo, t.b, "B", "sad", 3);
    assert.equal((await client.post(`/entry/${e.id}/delete/`)).status, 404);
    assert.equal((await client.get(`/entry/${e.id}/after/`)).status, 404);
    assert.ok(t.repo.entry(e.id));
  });

  it("わたしの半券：共有の変更と削除", async () => {
    const e = make(t.repo, t.a, "M", "sad", 3, "calm", 7);
    make(t.repo, t.a, "N", "tired", 4);
    const { body } = await client.text("/mine/");
    assert.match(body, /心のお守り作品/);
    assert.match(body, /鑑賞中/);
    assert.match(body, /<svg class="chart"/);

    let r = await client.post(`/entry/${e.id}/share/`, { share: "private" });
    assert.equal(location(r), `/mine/#e${e.id}`);
    assert.equal(t.repo.entry(e.id)!.share, "private");
    assert.match((await client.text("/mine/")).body, /『M』の共有を「自分だけ」にしました。/);

    assert.match((await client.text(`/mine/?confirm=${e.id}`)).body, /この半券を削除しますか？/);
    r = await client.post(`/entry/${e.id}/delete/`);
    assert.equal(location(r), "/mine/");
    assert.equal(t.repo.entry(e.id), null);
  });

  it("よそのサイトからの送信は拒否する（CSRF）", async () => {
    const e = make(t.repo, t.a, "M", "sad", 3);
    const r = await client.post(`/entry/${e.id}/delete/`, {}, "https://evil.example");
    assert.equal(r.status, 403);
    assert.ok(t.repo.entry(e.id));
  });

  it("カレンダー：観終わった半券を日ごとに数える", async () => {
    const today = localDate(new Date(), "Asia/Tokyo");
    make(t.repo, t.a, "前後そろい", "sad", 3, "calm", 7);
    make(t.repo, t.a, "前後そろい2", "tired", 4, "joy", 8);
    make(t.repo, t.a, "鑑賞中", "tired", 4);
    make(t.repo, t.b, "他人の", "sad", 3, "calm", 7);
    let { body } = await client.text("/calendar/");
    assert.match(body, /<div class="v mono">2<\/div><div class="k">この月の半券/);
    assert.match(body, /<div class="v mono">1<\/div><div class="k">記録した日/);
    assert.match(body, new RegExp(`aria-label="${today.month}月${today.day}日 半券2枚"`));

    ({ body } = await client.text(`/calendar/?m=${ym(today.year, today.month)}&d=${today.day}`));
    assert.match(body, /前後そろい2/);
    assert.doesNotMatch(body, /鑑賞中<\/h3>/);
    assert.doesNotMatch(body, /他人の/);
  });

  it("カレンダー：おかしな指定でも表示できる", async () => {
    for (const q of ["m=2026-13", "m=abc", "m=2026-02&d=31", "d=x"]) {
      assert.equal((await client.get(`/calendar/?${q}`)).status, 200, q);
    }
  });

  it("最近の作品：種類ごとに新しい10件", async () => {
    const now = Date.now();
    for (const kind of ["movie", "book", "drama"] as const)
      for (let i = 0; i < 12; i++)
        t.repo.saveWork({ kind, title: `${kind}-${String(i).padStart(2, "0")}`, note: "", url: "", image: "", imageUrl: "" },
          undefined, new Date(now - i * 864e5).toISOString());
    const { body } = await client.text("/recent/");
    const sections = [...body.matchAll(/<h3>(本|映画|ドラマ)<\/h3>/g)].map((m) => m[1]);
    assert.deepEqual(sections, ["映画", "本", "ドラマ"]);
    for (const kind of ["movie", "book", "drama"]) {
      const titles = [...body.matchAll(new RegExp(`<span class="work-title">(${kind}-\\d+)`, "g"))].map((m) => m[1]);
      assert.deepEqual(titles, Array.from({ length: 10 }, (_, i) => `${kind}-${String(i).padStart(2, "0")}`));
    }
  });

  it("最近の作品：リンクのある作品は別タブで開く", async () => {
    t.repo.saveWork({ kind: "movie", title: "リンクあり", note: "", url: "https://example.com/movie", image: "", imageUrl: "" });
    t.repo.saveWork({ kind: "movie", title: "リンクなし", note: "", url: "", image: "", imageUrl: "" });
    const { body } = await client.text("/recent/");
    assert.ok(body.includes('<a class="work-in" href="https://example.com/movie" target="_blank" rel="noopener noreferrer">'));
    assert.ok(body.includes('リンクあり<span class="ext"'));
    assert.ok(body.includes('<span class="work-title">リンクなし</span>'));
  });

  it("管理画面：作品の画像を縮小して保存し、差し替え・削除で古いファイルを消す", async () => {
    makeStaff(t.a.id);
    let r = await client.post("/admin/works/add/", { kind: "book", title: "画像つき", note: "", url: "", image_url: "", image: await png() });
    assert.equal(r.status, 302);
    let w = t.repo.works({ q: "画像つき" })[0]!;
    assert.match(w.image, /^works\/book\/[0-9a-f]{32}\.jpg$/);
    const meta = await sharp(path.join(t.mediaRoot, w.image)).metadata();
    assert.equal(Math.max(meta.width!, meta.height!), 800);
    assert.ok((await client.text("/recent/")).body.includes(`<img src="${coverUrl(w)}"`));

    const old = w.image;
    await client.post(`/admin/works/${w.id}/`, { kind: "book", title: "画像つき", note: "", url: "", image_url: "", image: await png() });
    w = t.repo.work(w.id)!;
    assert.notEqual(w.image, old);
    assert.ok(!existsSync(path.join(t.mediaRoot, old)));

    await client.post(`/admin/works/${w.id}/delete/`);
    assert.equal(t.repo.work(w.id), null);
    assert.ok(!existsSync(path.join(t.mediaRoot, w.image)));
  });

  it("管理画面：javascript: の URL は受け付けない", async () => {
    makeStaff(t.a.id);
    for (const field of ["url", "image_url"]) {
      const r = await client.post("/admin/works/add/", { kind: "book", title: "危険", [field]: "javascript:alert(1)" });
      assert.equal(r.status, 200);
      assert.match(await r.text(), /URLを正しく入力してください/);
    }
    assert.equal(t.repo.works().length, 0);
  });

  it("作品の画像はアップロードを画像URLより優先する", async () => {
    const ext = "https://example.com/cover.jpg";
    const w = t.repo.saveWork({ kind: "drama", title: "URLだけ", note: "", url: "", image: "", imageUrl: ext });
    assert.equal(coverUrl(w), ext);
    assert.ok((await client.text("/recent/")).body.includes(`<img src="${ext}" alt="" loading="lazy" referrerpolicy="no-referrer"`));

    const w2 = t.repo.saveWork({ ...w, image: "works/drama/x.jpg" }, w.id);
    assert.equal(coverUrl(w2), "/media/works/drama/x.jpg");
    const { body } = await client.text("/recent/");
    assert.ok(body.includes('<img src="/media/works/drama/x.jpg"'));
    assert.ok(!body.includes(ext));
    assert.equal(coverUrl({ image: "", imageUrl: "" }), "");
  });

  it("新しい半券は同名の作品に結びつく（同じ種類を優先）", async () => {
    const ext = "https://example.com/witch.jpg";
    t.repo.saveWork({ kind: "movie", title: "西の魔女が死んだ", note: "", url: "https://example.com/movie", image: "", imageUrl: "" });
    const book = t.repo.saveWork({ kind: "book", title: "西の魔女が死んだ", note: "", url: "https://example.com/book", image: "", imageUrl: ext });
    await client.post("/", { kind: "book", title: " 西の魔女が死んだ ", before_emo: "tired", before_mood: 3, share: "public" });
    const e = t.repo.userEntries(t.a.id)[0]!;
    assert.equal(e.workId, book.id);
    const { body } = await client.text("/mine/");
    assert.ok(body.includes('href="https://example.com/book" target="_blank" rel="noopener noreferrer">西の魔女が死んだ'));
    assert.ok(body.includes(`<span class="stub-cover"><img src="${ext}"`));

    await client.post("/", { kind: "drama", title: "西の魔女が死んだ", before_emo: "sad", before_mood: 4, share: "public" });
    assert.ok(t.repo.userEntries(t.a.id).find((x) => x.kind === "drama")!.workId);

    await client.post("/", { kind: "book", title: "まだない作品", before_emo: "sad", before_mood: 4, share: "public" });
    assert.equal(t.repo.userEntries(t.a.id).find((x) => x.title === "まだない作品")!.workId, null);
  });

  it("あとから登録した作品に既存の半券が結びつき、作品を消しても半券は残る", async () => {
    const e = make(t.repo, t.a, "Later Work", "sad", 3, "calm", 7, "public", "movie");
    makeStaff(t.a.id);
    await client.post("/admin/works/add/", { kind: "movie", title: "later work", note: "", url: "", image_url: "" });
    const linked = t.repo.entry(e.id)!;
    assert.equal(linked.work?.title, "later work");
    t.repo.deleteWork(linked.workId!);
    assert.equal(t.repo.entry(e.id)!.workId, null);
  });

  it("広告タグは改変せず「PR」付きで、選んだ場所にだけ出す", async () => {
    const tag =
      '<a href="https://px.a8.net/svt/ejp?a8mat=X&a8ejpredirect=https%3A%2F%2Fexample.com%2F" rel="nofollow">広告文</a>' +
      '<img border="0" width="1" height="1" src="https://www15.a8.net/0.gif?a8mat=X" alt="">';
    t.repo.saveAd({ name: "下の広告", placement: "footer", html: tag, isActive: true, order: 0 });
    t.repo.saveAd({ name: "最近の作品の広告", placement: "recent", html: "<b>recent-ad</b>", isActive: true, order: 0 });
    t.repo.saveAd({ name: "止めた広告", placement: "footer", html: "<b>off-ad</b>", isActive: false, order: 0 });

    const { body } = await client.text("/mine/");
    assert.ok(body.includes(tag));
    assert.ok(body.includes('<span class="pr">PR</span>'));
    assert.ok(!body.includes("recent-ad"));
    assert.ok(!body.includes("off-ad"));
    assert.ok((await client.text("/recent/")).body.includes("<b>recent-ad</b>"));

    for (const ad of t.repo.ads()) t.repo.deleteAd(ad.id);
    assert.ok(!(await client.text("/mine/")).body.includes('class="ads"'));
  });

  it("管理画面のタブはスタッフだけ", async () => {
    const link = 'href="/admin/">管理画面';
    assert.ok(!(await client.text("/recent/")).body.includes(link));
    assert.equal((await client.get("/admin/")).status, 404);
    makeStaff(t.a.id);
    assert.ok((await client.text("/recent/")).body.includes(link));
    assert.equal((await client.get("/admin/")).status, 200);
  });

  it("ログインすると最近の作品へ。戻り先が指定されていればそこへ", async () => {
    const c = t.client();
    assert.equal(location(await c.post("/accounts/login/", { username: "a", password: "pw-123456-x" })), "/recent/");
    const c2 = t.client();
    assert.equal(location(await c2.post("/accounts/login/", { username: "a", password: "pw-123456-x", next: "/mine/" })), "/mine/");
    const c3 = t.client();
    assert.equal(location(await c3.post("/accounts/login/", { username: "a", password: "pw-123456-x", next: "//evil.example" })), "/recent/");
    const bad = await t.client().post("/accounts/login/", { username: "a", password: "wrong" });
    assert.equal(bad.status, 200);
    assert.match(await bad.text(), /ニックネームかパスワードが違います/);
  });

  it("ログアウト", async () => {
    await client.post("/accounts/logout/");
    assert.equal((await client.get("/mine/")).status, 302);
  });

  it("登録", async () => {
    const c = t.client();
    const r = await c.post("/accounts/signup/", { username: "newbie", password1: "kanjo-hanken-2026", password2: "kanjo-hanken-2026" });
    assert.equal(location(r), "/recent/");
    assert.equal((await c.get("/mine/")).status, 200);

    const dup = await t.client().post("/accounts/signup/", { username: "NEWBIE", password1: "kanjo-hanken-2026", password2: "kanjo-hanken-2026" });
    assert.match(await dup.text(), /同じニックネームがすでに登録されています/);
    const weak = await t.client().post("/accounts/signup/", { username: "x", password1: "1234567", password2: "1234567" });
    const body = await weak.text();
    assert.match(body, /短すぎます/);
    assert.match(body, /数字しか使われていません/);
  });

  it("スラッシュなしの URL はスラッシュつきへ", async () => {
    const r = await client.get("/mine");
    assert.equal(r.status, 301);
    assert.equal(location(r), "http://localhost/mine/");
  });
});
