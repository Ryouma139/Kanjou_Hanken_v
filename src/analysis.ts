/** 半券の集計。画面にそのまま渡せる形で返す。Django版の analysis.py に相当。 */
import { makeDate, sameDay, ymdKey, type YMD } from "./dates.ts";
import { EMOTIONS, EMOTION_NAME, type Emotion, type Kind } from "./emotions.ts";
import { finishedOn, isDone, type DoneEntry, type Entry } from "./models.ts";

export interface Summary {
  n: number;
  avg: number;
  upPct: number;
}

/** 完了済みの半券から 件数・平均変化・上がった割合 を出す。 */
export function summarize(entries: Entry[]): Summary {
  const ds = entries.filter(isDone).map((e) => e.afterMood - e.beforeMood);
  if (!ds.length) return { n: 0, avg: 0, upPct: 0 };
  return {
    n: ds.length,
    avg: ds.reduce((a, b) => a + b, 0) / ds.length,
    upPct: Math.round((ds.filter((d) => d > 0).length / ds.length) * 100),
  };
}

export interface EmoCount {
  key: Emotion;
  name: string;
  n: number;
}

/** 観る前の気持ちごとの件数（定義順、0件は除く）。 */
export function beforeCounts(entries: Entry[]): EmoCount[] {
  const c = new Map<Emotion, number>();
  for (const e of entries) c.set(e.beforeEmo, (c.get(e.beforeEmo) ?? 0) + 1);
  return EMOTIONS.filter(([k]) => c.get(k)).map(([k, name]) => ({ key: k, name, n: c.get(k)! }));
}

/** 観た後の気持ちの分布（多い順。同数なら先に出てきた順）。pct は最多を100とした棒の長さ。 */
export function afterDistribution(entries: Entry[]): (EmoCount & { pct: number })[] {
  const c = new Map<Emotion, number>();
  for (const e of entries) if (isDone(e)) c.set(e.afterEmo, (c.get(e.afterEmo) ?? 0) + 1);
  if (!c.size) return [];
  const top = Math.max(...c.values());
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ key: k, name: EMOTION_NAME[k], n, pct: (n / top) * 100 }));
}

export interface WorkRank {
  title: string;
  kind: Kind;
  n: number;
  avg: number;
}

/** 同じ作品（種類＋作品名、大文字小文字は区別しない）ごとの平均変化。 */
export function workRanking(entries: Entry[], limit = 6): WorkRank[] {
  const groups = new Map<string, { title: string; kind: Kind; ds: number[] }>();
  for (const e of entries) {
    if (!isDone(e)) continue;
    const key = `${e.kind}\u0000${e.title.trim().toLowerCase()}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { title: e.title.trim(), kind: e.kind, ds: [] }));
    g.ds.push(e.afterMood - e.beforeMood);
  }
  const rows = [...groups.values()].map((g) => ({
    title: g.title,
    kind: g.kind,
    n: g.ds.length,
    avg: g.ds.reduce((a, b) => a + b, 0) / g.ds.length,
  }));
  rows.sort((a, b) => b.avg - a.avg || b.n - a.n);
  return rows.slice(0, limit);
}

/** 自分の記録のうち、気分が上がった作品を変化の大きい順に。 */
export function comfortWorks(entries: Entry[], limit = 3): DoneEntry[] {
  const d = (e: DoneEntry) => e.afterMood - e.beforeMood;
  return entries
    .filter(isDone)
    .filter((e) => d(e) > 0)
    .sort((a, b) => d(b) - d(a))
    .slice(0, limit);
}

// スロープチャート（観る前→観た後）の座標
export const SLOPE = { w: 340, h: 210, x1: 78, x2: 262, top: 30, bottom: 182 } as const;

const r1 = (v: number) => Math.round(v * 10) / 10;
const slopeY = (mood: number) => SLOPE.bottom - ((mood - 1) * (SLOPE.bottom - SLOPE.top)) / 9;

export interface SlopeLine {
  title: string;
  b: number;
  a: number;
  yb: number;
  ya: number;
  bEmo: Emotion;
  aEmo: Emotion;
  dir: "up" | "down" | "flat";
}

export interface SlopeChart {
  w: number;
  h: number;
  x1: number;
  x2: number;
  lines: SlopeLine[];
  ticks: { m: number; y: number }[];
  labelY: number;
  tickX: number;
}

/** 新しい順に並んだ半券から、最近 limit 件を古い順に描く。 */
export function slopeChart(entries: Entry[], limit = 10): SlopeChart {
  const done = entries.filter(isDone).slice(0, limit).reverse();
  const lines = done.map((e, i): SlopeLine => {
    const jitter = ((i % 3) - 1) * 2;
    const d = e.afterMood - e.beforeMood;
    return {
      title: e.title,
      b: e.beforeMood,
      a: e.afterMood,
      yb: r1(slopeY(e.beforeMood) + jitter),
      ya: r1(slopeY(e.afterMood) + jitter),
      bEmo: e.beforeEmo,
      aEmo: e.afterEmo,
      dir: d > 0 ? "up" : d < 0 ? "down" : "flat",
    };
  });
  return {
    w: SLOPE.w,
    h: SLOPE.h,
    x1: SLOPE.x1,
    x2: SLOPE.x2,
    lines,
    ticks: [1, 5, 10].map((m) => ({ m, y: r1(slopeY(m)) })),
    labelY: SLOPE.h - 6,
    tickX: SLOPE.x1 - 12,
  };
}

export interface CalCell {
  day: number;
  inMonth: boolean;
  n: number;
  today: boolean;
}

export interface MonthCalendar {
  weeks: CalCell[][];
  total: number;
  days: number;
}

/** 観る前＋観た後がそろった半券を1枚として、観終わった日ごとに数える（日曜はじまり）。 */
export function monthCalendar(entries: Entry[], year: number, month: number, timeZone: string, today?: YMD): MonthCalendar {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const d = finishedOn(e, timeZone);
    if (d) counts.set(ymdKey(d), (counts.get(ymdKey(d)) ?? 0) + 1);
  }

  const first = makeDate(year, month, 1)!;
  const start = new Date(Date.UTC(first.year, first.month - 1, 1));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay()); // その週の日曜まで戻る
  const weeks: CalCell[][] = [];
  const cur = new Date(start);
  do {
    const week: CalCell[] = [];
    for (let i = 0; i < 7; i++) {
      const d: YMD = { year: cur.getUTCFullYear(), month: cur.getUTCMonth() + 1, day: cur.getUTCDate() };
      const inMonth = d.year === year && d.month === month;
      week.push({ day: d.day, inMonth, n: inMonth ? counts.get(ymdKey(d)) ?? 0 : 0, today: sameDay(d, today) });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    weeks.push(week);
  } while (cur.getUTCFullYear() * 12 + cur.getUTCMonth() <= year * 12 + month - 1);

  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-`;
  const inMonth = [...counts.entries()].filter(([k]) => k.startsWith(prefix)).map(([, n]) => n);
  return { weeks, total: inMonth.reduce((a, b) => a + b, 0), days: inMonth.length };
}

export function careLine(delta: number): string {
  if (delta >= 3)
    return "この作品は、あなたの心をしっかり軽くしてくれたようです。また同じ気持ちになったとき、思い出せるように残しておきましょう。";
  if (delta > 0) return "少しだけ気持ちが上向きました。小さな変化も、自分をいたわれた証拠です。";
  if (delta === 0)
    return "気分の数字は変わらなくても、気持ちの色が変わることがあります。今日も作品と過ごせたことを記録できました。";
  return "観たあと、少し重くなったようです。心が動いた分、疲れることもあります。今日はゆっくり休んでくださいね。";
}
