import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import * as analysis from "../src/analysis.ts";
import { checkPassword, hashPassword } from "../src/auth.ts";
import { signed, trend } from "../src/format.ts";
import { sniffImage } from "../src/photos.ts";
import { make, setup } from "./helpers.ts";

describe("集計", () => {
  let t: Awaited<ReturnType<typeof setup>>;
  before(async () => (t = await setup()));
  beforeEach(() => t.reset());
  after(() => t.close());

  it("平均変化・上がった割合・作品ランキング", async () => {
    const es = [
      await make(t.repo, t.a, "X", "anxious", 3, "calm", 7),
      await make(t.repo, t.a, "x ", "anxious", 4, "calm", 6),
      await make(t.repo, t.a, "Y", "anxious", 5, "sad", 4),
    ];
    const s = analysis.summarize(es);
    assert.equal(s.n, 3);
    assert.ok(Math.abs(s.avg - (4 + 2 - 1) / 3) < 1e-9);
    assert.equal(s.upPct, 67);
    const rank = analysis.workRanking(es);
    assert.equal(rank[0]!.n, 2); // X と x は同じ作品
    assert.equal(rank[0]!.avg, 3);
  });

  it("鑑賞中の半券は集計しない", async () => {
    const es = [await make(t.repo, t.a, "Z", "tired", 3)];
    assert.equal(analysis.summarize(es).n, 0);
    assert.deepEqual(analysis.slopeChart(es).lines, []);
  });

  it("観た後の分布は多い順で、最多が100%", async () => {
    const es = [
      await make(t.repo, t.a, "A", "sad", 3, "calm", 5),
      await make(t.repo, t.a, "B", "sad", 3, "joy", 5),
      await make(t.repo, t.a, "C", "sad", 3, "joy", 5),
    ];
    const d = analysis.afterDistribution(es);
    assert.deepEqual(d.map((x) => [x.key, x.n, x.pct]), [["joy", 2, 100], ["calm", 1, 50]]);
  });
});

describe("小さな部品", () => {
  it("カレンダーは日曜はじまりで、月の外の日も含めて週を埋める", () => {
    // 2026年11月1日は日曜
    const cal = analysis.monthCalendar([], 2026, 11, "Asia/Tokyo");
    assert.equal(cal.weeks[0]![0]!.day, 1);
    assert.ok(cal.weeks.every((w) => w.length === 7));
    assert.equal(cal.weeks.at(-1)!.at(-1)!.day, 5); // 12月5日（土）まで
    // 2026年2月1日も日曜で、ちょうど4週
    assert.equal(analysis.monthCalendar([], 2026, 2, "Asia/Tokyo").weeks.length, 4);
  });

  it("+4 / −2 / ±0 の表記", () => {
    assert.equal(signed(4), "+4");
    assert.equal(signed(-2), "−2");
    assert.equal(signed(0), "±0");
    assert.equal(signed(1.666, 1), "+1.7");
    assert.equal(signed(null), "");
    assert.equal(trend(-1), "down");
  });

  it("ケアのひとこと", () => {
    assert.match(analysis.careLine(3), /しっかり軽く/);
    assert.match(analysis.careLine(1), /少しだけ/);
    assert.match(analysis.careLine(0), /変わらなくても/);
    assert.match(analysis.careLine(-1), /ゆっくり休んで/);
  });

  it("パスワードは PBKDF2 で保存し、照合できる", async () => {
    const h = await hashPassword("kanjo-hanken-2026");
    assert.match(h, /^pbkdf2_sha256\$100000\$/);
    assert.ok(await checkPassword("kanjo-hanken-2026", h));
    assert.ok(!(await checkPassword("wrong", h)));
    assert.notEqual(h, await hashPassword("kanjo-hanken-2026")); // 毎回ちがう塩
  });

  it("画像の種類は先頭のバイトで見分ける", () => {
    assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext, "jpg");
    assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext, "png");
    assert.equal(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  });
});
