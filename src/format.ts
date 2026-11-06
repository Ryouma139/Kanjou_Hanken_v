/** 表示用の小さな関数。Django版の templatetags/hanken_tags.py に相当。 */
import { EMOTION_CHAR, EMOTION_NAME, KIND_NAME, MOOD_WORDS, type Emotion, type Kind } from "./emotions.ts";

export const emoName = (k: Emotion | "" | null | undefined) => (k ? EMOTION_NAME[k] ?? "" : "");
export const emoChar = (k: Emotion | "" | null | undefined) => (k ? EMOTION_CHAR[k] ?? "" : "");
export const kindName = (k: Kind | string | null | undefined) => (k ? KIND_NAME[k as Kind] ?? "" : "");

export function moodWord(v: unknown): string {
  const n = Number(v);
  return Number.isInteger(n) ? MOOD_WORDS[n] ?? "" : "";
}

/** +4 / −2 / ±0 の形にする。digits を指定すると小数点以下を出す。 */
export function signed(v: number | null | undefined, digits = 0): string {
  if (v == null) return "";
  const mark = v > 0 ? "+" : v < 0 ? "−" : "±";
  return mark + Math.abs(v).toFixed(digits);
}

/** CSSクラス用：up / down / flat */
export function trend(v: number | null | undefined): "" | "up" | "down" | "flat" {
  if (v == null) return "";
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}
