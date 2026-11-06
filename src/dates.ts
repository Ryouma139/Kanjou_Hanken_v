/** 日付まわり。DB には UTC の ISO 文字列で保存し、表示や「その日」の判定は設定のタイムゾーンで行う。 */

/** 年月日だけの日付。月は 1〜12。 */
export interface YMD {
  year: number;
  month: number;
  day: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** ISO 文字列（または Date）をタイムゾーンでの年月日にする。 */
export function localDate(at: string | Date, timeZone: string): YMD {
  const d = typeof at === "string" ? new Date(at) : at;
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(d).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export const ymdKey = (d: YMD) =>
  `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;

export const sameDay = (a: YMD | null | undefined, b: YMD | null | undefined) =>
  !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 存在する日付なら YMD、そうでなければ null（Python の date() 相当の検査）。 */
export function makeDate(year: number, month: number, day: number): YMD | null {
  if (![year, month, day].every(Number.isInteger)) return null;
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function shiftMonth(year: number, month: number, step: number): [number, number] {
  const n = year * 12 + month - 1 + step;
  return [Math.floor(n / 12), (n % 12) + 1];
}

export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** 「2026.11.6」の形 */
export function dotDate(at: string | null | undefined, timeZone: string): string {
  if (!at) return "";
  const d = localDate(at, timeZone);
  return `${d.year}.${d.month}.${d.day}`;
}
