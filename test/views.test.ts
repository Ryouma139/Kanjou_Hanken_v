import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { localDate, ym } from "../src/dates.ts";
import { coverUrl } from "../src/models.ts";
import { Client, jpeg, location, make, png, setup } from "./helpers.ts";

describe("画面", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  let client: Client;

  before(async () => (t = await setup()));
  beforeEach(async () => {
    await t.reset();
    client = t.client();
    await client.login("a");
  });
  after(() => t.close());

  const makeStaff = (id: number) => t.db.query("UPDATE users SET is_staff = TRUE WHERE id = $1", [id]);
  const workInput = { note: "", url: "", image: "", imageUrl: "" };

  it("ログインしていなければログイン画面へ", async () => {
    const r = await t.client().get("/mine/");
    assert.equal(r.status, 302);
    assert.equal(location(r), "/accounts/login/?next=%2Fmine%2F");
  });

  it("観る前を記録してから、観た後を記録する", async () => {
    let r = await client.post("/", {
      kind: "book", title: "西の魔女が死んだ", before_emo: "tired", before_mood: 3, share: "anon", before_photo: png(),
    });
    assert.equal(location(r), "/");
    const [e] = await t.repo.userEntries(t.a.id);
    assert.ok(e);
    assert.equal(e.afterEmo, "");
    assert.match(e.beforePhoto, /^photos\/\d{4}\/\d{2}\/[0-9a-f]{32}\.png$/);
    assert.equal(t.storage.files.get(e.beforePhoto)?.contentType, "image/png");
    assert.match((await client.text("/")).body, /観る前の気持ちを記録しました/);

    r = await client.post(`/entry/${e.id}/after/`, { after_emo: "calm", after_mood: 8, after_photo: jpeg() });
    assert.equal(location(r), `/entry/${e.id}/reflect/`);
    const done = (await t.repo.entry(e.id))!;
    assert.equal(done.afterMood! - done.beforeMood, 5);
    assert.match(done.afterPhoto, /\.jpg$/);
    assert.match((await client.text(`/entry/${e.id}/reflect/`)).body, /\+5/);

    // 写真はログインした人にだけ配信
    const img = await client.get(`/media/${e.beforePhoto}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get("content-type"), "image/png");
    assert.equal((await t.client().get(`/media/${e.beforePhoto}`)).status, 302);
  });

  it("「自分だけ」の半券の写真は、持ち主にしか見えない", async () => {
    await t.storage.put("photos/2026/11/secret.png", new Uint8Array([1]), "image/png");
    await t.storage.put("photos/2026/11/shared.png", new Uint8Array([1]), "image/png");
    await make(t.repo, t.b, "秘密", "sad", 3, undefined, undefined, "private", "movie", { before: "photos/2026/11/secret.png" });
    await make(t.repo, t.b, "共有", "sad", 3, undefined, undefined, "anon", "movie", { before: "photos/2026/11/shared.png" });
    assert.equal((await client.get("/media/photos/2026/11/secret.png")).status, 404);
    assert.equal((await client.get("/media/photos/2026/11/shared.png")).status, 200);
    const owner = t.client();
    await owner.login("b");
    assert.equal((await owner.get("/media/photos/2026/11/secret.png")).status, 200);
    assert.equal((await client.get("/media/photos%2F..%2F..%2Fsecret.png")).status, 404);
  });

  it("「もう観終わった」なら観た後の気持ちも必須", async () => {
    const r = await client.post("/", {
      kind: "movie", title: "T", before_emo: "sad", before_mood: 4, both: "on", after_mood: 6, share: "public",
    });
    assert.equal(r.status, 200);
    const body = await r.text();
    assert.match(body, /観た後の気持ちも一つ選んでください。/);
    assert.match(body, /id="after-panel"(?! hidden)/);
    assert.equal((await t.repo.allEntries()).length, 0);
  });

  it("前と後を一度に記録するとふり返りへ", async () => {
    const r = await client.post("/", {
      kind: "movie", title: "T", before_emo: "sad", before_mood: 4, both: "on", after_emo: "joy", after_mood: 6, share: "public",
    });
    const [e] = await t.repo.userEntries(t.a.id);
    assert.equal(location(r), `/entry/${e!.id}/reflect/`);
  });

  it("画像でないファイルは受け付けない", async () => {
    const r = await client.post("/", {
      kind: "book", title: "X", before_emo: "sad", before_mood: 4, share: "public",
      before_photo: new Blob(["<svg onload=alert(1)>"], { type: "image/png" }),
    });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /画像でないか、または壊れています/);
    assert.equal((await t.repo.allEntries()).length, 0);
    assert.equal(t.storage.files.size, 0);
  });

  it("写真の入力欄に、ブラウザで縮小する大きさが書いてある", async () => {
    const { body } = await client.text("/");
    assert.ok(body.includes('name="before_photo" id="id_before_photo" accept="image/*" data-max-side="1280"'));
  });

  it("みんなの変化：自分だけの半券は出さず、匿名は匿名さん", async () => {
    await make(t.repo, t.b, "公開作品", "anxious", 3, "calm", 7, "public");
    await make(t.repo, t.b, "匿名作品", "anxious", 3, "joy", 8, "anon");
    await make(t.repo, t.b, "秘密作品", "anxious", 3, "joy", 9, "private");
    const { body } = await client.text("/share/?emo=anxious");
    assert.match(body, /公開作品/);
    assert.match(body, /匿名さん/);
    assert.doesNotMatch(body, /秘密作品/);
    assert.match(body, /<div class="v mono">2<\/div><div class="k">半券<\/div>/);
  });

  it("みんなの変化：気持ちの指定がなければ、自分が最近記録した気持ち", async () => {
    await make(t.repo, t.b, "P", "anxious", 3, "calm", 7);
    await make(t.repo, t.b, "Q", "sad", 3, "calm", 7);
    await make(t.repo, t.b, "R", "sad", 3, "calm", 7);
    await make(t.repo, t.a, "自分の", "anxious", 3);
    assert.match((await client.text("/share/")).body, /〈<span style="color:var\(--e-anxious\)">不安/);
  });

  it("他人の半券には触れない", async () => {
    const e = await make(t.repo, t.b, "B", "sad", 3);
    assert.equal((await client.post(`/entry/${e.id}/delete/`)).status, 404);
    assert.equal((await client.get(`/entry/${e.id}/after/`)).status, 404);
    assert.ok(await t.repo.entry(e.id));
  });

  it("わたしの半券：共有の変更と削除（写真も消える）", async () => {
    await t.storage.put("photos/2026/11/m.png", new Uint8Array([1]), "image/png");
    const e = await make(t.repo, t.a, "M", "sad", 3, "calm", 7, "public", "movie", { before: "photos/2026/11/m.png" });
    await make(t.repo, t.a, "N", "tired", 4);
    const { body } = await client.text("/mine/");
    assert.match(body, /心のお守り作品/);
    assert.match(body, /鑑賞中/);
    assert.match(body, /<svg class="chart"/);

    let r = await client.post(`/entry/${e.id}/share/`, { share: "private" });
    assert.equal(location(r), `/mine/#e${e.id}`);
    assert.equal((await t.repo.entry(e.id))!.share, "private");
    assert.match((await client.text("/mine/")).body, /『M』の共有を「自分だけ」にしました。/);

    assert.match((await client.text(`/mine/?confirm=${e.id}`)).body, /この半券を削除しますか？/);
    r = await client.post(`/entry/${e.id}/delete/`);
    assert.equal(location(r), "/mine/");
    assert.equal(await t.repo.entry(e.id), null);
    assert.ok(!t.storage.files.has("photos/2026/11/m.png"));
  });

  it("よそのサイトからの送信は拒否する（CSRF）", async () => {
    const e = await make(t.repo, t.a, "M", "sad", 3);
    const r = await client.post(`/entry/${e.id}/delete/`, {}, "https://evil.example");
    assert.equal(r.status, 403);
    assert.ok(await t.repo.entry(e.id));
  });

  it("カレンダー：観終わった半券を日ごとに数える", async () => {
    const today = localDate(new Date(), "Asia/Tokyo");
    await make(t.repo, t.a, "前後そろい", "sad", 3, "calm", 7);
    await make(t.repo, t.a, "前後そろい2", "tired", 4, "joy", 8);
    await make(t.repo, t.a, "鑑賞中", "tired", 4);
    await make(t.repo, t.b, "他人の", "sad", 3, "calm", 7);
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
        await t.repo.saveWork({ kind, title: `${kind}-${String(i).padStart(2, "0")}`, ...workInput },
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
    await t.repo.saveWork({ kind: "movie", title: "リンクあり", ...workInput, url: "https://example.com/movie" });
    await t.repo.saveWork({ kind: "movie", title: "リンクなし", ...workInput });
    const { body } = await client.text("/recent/");
    assert.ok(body.includes('<a class="work-in" href="https://example.com/movie" target="_blank" rel="noopener noreferrer">'));
    assert.ok(body.includes('リンクあり<span class="ext"'));
    assert.ok(body.includes('<span class="work-title">リンクなし</span>'));
  });

  it("管理画面：作品の画像を保存し、差し替え・削除で古いファイルを消す", async () => {
    await makeStaff(t.a.id);
    const r = await client.post("/admin/works/add/", { kind: "book", title: "画像つき", note: "", url: "", image_url: "", image: png() });
    assert.equal(r.status, 302);
    let w = (await t.repo.works({ q: "画像つき" }))[0]!;
    assert.match(w.image, /^works\/book\/[0-9a-f]{32}\.png$/);
    assert.ok((await client.text("/recent/")).body.includes(`<img src="${coverUrl(w)}"`));
    assert.equal((await client.get(coverUrl(w))).status, 200);

    const old = w.image;
    await client.post(`/admin/works/${w.id}/`, { kind: "book", title: "画像つき", note: "", url: "", image_url: "", image: jpeg() });
    w = (await t.repo.work(w.id))!;
    assert.notEqual(w.image, old);
    assert.ok(!t.storage.files.has(old));

    await client.post(`/admin/works/${w.id}/delete/`);
    assert.equal(await t.repo.work(w.id), null);
    assert.ok(!t.storage.files.has(w.image));
  });

  it("管理画面：javascript: の URL は受け付けない", async () => {
    await makeStaff(t.a.id);
    for (const field of ["url", "image_url"]) {
      const r = await client.post("/admin/works/add/", { kind: "book", title: "危険", [field]: "javascript:alert(1)" });
      assert.equal(r.status, 200);
      assert.match(await r.text(), /URLを正しく入力してください/);
    }
    assert.equal((await t.repo.works()).length, 0);
  });

  it("管理画面：同じ種類・作品名は登録できない", async () => {
    await makeStaff(t.a.id);
    await client.post("/admin/works/add/", { kind: "book", title: "同じ" });
    const r = await client.post("/admin/works/add/", { kind: "book", title: "同じ" });
    assert.match(await r.text(), /同じ種類・作品名の作品がすでに登録されています/);
  });

  it("作品の画像はアップロードを画像URLより優先する", async () => {
    const ext = "https://example.com/cover.jpg";
    const w = await t.repo.saveWork({ kind: "drama", title: "URLだけ", ...workInput, imageUrl: ext });
    assert.equal(coverUrl(w), ext);
    assert.ok((await client.text("/recent/")).body.includes(`<img src="${ext}" alt="" loading="lazy" referrerpolicy="no-referrer"`));

    const w2 = await t.repo.saveWork({ ...w, image: "works/drama/x.jpg" }, w.id);
    assert.equal(coverUrl(w2), "/media/works/drama/x.jpg");
    const { body } = await client.text("/recent/");
    assert.ok(body.includes('<img src="/media/works/drama/x.jpg"'));
    assert.ok(!body.includes(ext));
    assert.equal(coverUrl({ image: "", imageUrl: "" }), "");
  });

  it("新しい半券は同名の作品に結びつく（同じ種類を優先）", async () => {
    const ext = "https://example.com/witch.jpg";
    await t.repo.saveWork({ kind: "movie", title: "西の魔女が死んだ", ...workInput, url: "https://example.com/movie" });
    const book = await t.repo.saveWork({ kind: "book", title: "西の魔女が死んだ", ...workInput, url: "https://example.com/book", imageUrl: ext });
    await client.post("/", { kind: "book", title: " 西の魔女が死んだ ", before_emo: "tired", before_mood: 3, share: "public" });
    const e = (await t.repo.userEntries(t.a.id))[0]!;
    assert.equal(e.workId, book.id);
    const { body } = await client.text("/mine/");
    assert.ok(body.includes('href="https://example.com/book" target="_blank" rel="noopener noreferrer">西の魔女が死んだ'));
    assert.ok(body.includes(`<span class="stub-cover"><img src="${ext}"`));

    await client.post("/", { kind: "drama", title: "西の魔女が死んだ", before_emo: "sad", before_mood: 4, share: "public" });
    assert.ok((await t.repo.userEntries(t.a.id)).find((x) => x.kind === "drama")!.workId);

    await client.post("/", { kind: "book", title: "まだない作品", before_emo: "sad", before_mood: 4, share: "public" });
    assert.equal((await t.repo.userEntries(t.a.id)).find((x) => x.title === "まだない作品")!.workId, null);
  });

  it("あとから登録した作品に既存の半券が結びつき、作品を消しても半券は残る", async () => {
    const e = await make(t.repo, t.a, "Later Work", "sad", 3, "calm", 7, "public", "movie");
    await makeStaff(t.a.id);
    await client.post("/admin/works/add/", { kind: "movie", title: "later work", note: "", url: "", image_url: "" });
    const linked = (await t.repo.entry(e.id))!;
    assert.equal(linked.work?.title, "later work");
    await t.repo.deleteWork(linked.workId!);
    assert.equal((await t.repo.entry(e.id))!.workId, null);
  });

  it("広告タグは改変せず「PR」付きで、選んだ場所にだけ出す", async () => {
    const tag =
      '<a href="https://px.a8.net/svt/ejp?a8mat=X&a8ejpredirect=https%3A%2F%2Fexample.com%2F" rel="nofollow">広告文</a>' +
      '<img border="0" width="1" height="1" src="https://www15.a8.net/0.gif?a8mat=X" alt="">';
    await t.repo.saveAd({ name: "下の広告", placement: "footer", html: tag, isActive: true, order: 0 });
    await t.repo.saveAd({ name: "最近の作品の広告", placement: "recent", html: "<b>recent-ad</b>", isActive: true, order: 0 });
    await t.repo.saveAd({ name: "止めた広告", placement: "footer", html: "<b>off-ad</b>", isActive: false, order: 0 });

    const { body } = await client.text("/mine/");
    assert.ok(body.includes(tag));
    assert.ok(body.includes('<span class="pr">PR</span>'));
    assert.ok(!body.includes("recent-ad"));
    assert.ok(!body.includes("off-ad"));
    assert.ok((await client.text("/recent/")).body.includes("<b>recent-ad</b>"));

    for (const ad of await t.repo.ads()) await t.repo.deleteAd(ad.id);
    assert.ok(!(await client.text("/mine/")).body.includes('class="ads"'));
  });

  it("管理画面のタブはスタッフだけ", async () => {
    const link = 'href="/admin/">管理画面';
    assert.ok(!(await client.text("/recent/")).body.includes(link));
    assert.equal((await client.get("/admin/")).status, 404);
    await makeStaff(t.a.id);
    assert.ok((await client.text("/recent/")).body.includes(link));
    assert.equal((await client.get("/admin/")).status, 200);
  });

  it("ログインすると最近の作品へ。戻り先が指定されていればそこへ", async () => {
    const pw = "pw-123456-x";
    assert.equal(location(await t.client().post("/accounts/login/", { username: "a", password: pw })), "/recent/");
    assert.equal(location(await t.client().post("/accounts/login/", { username: "A", password: pw, next: "/mine/" })), "/mine/");
    assert.equal(location(await t.client().post("/accounts/login/", { username: "a", password: pw, next: "//evil.example" })), "/recent/");
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
