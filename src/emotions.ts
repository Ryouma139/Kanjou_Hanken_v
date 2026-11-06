/** 気持ち・作品の種類・共有範囲の定義。 */

// [キー, 表示名, 半券に描く一文字]
export const EMOTIONS = [
  ["joy", "嬉しい", "喜"],
  ["excited", "ワクワク", "躍"],
  ["calm", "穏やか", "穏"],
  ["moved", "じんとする", "感"],
  ["lonely", "寂しい", "寂"],
  ["sad", "悲しい", "哀"],
  ["anxious", "不安", "憂"],
  ["irritated", "イライラ", "苛"],
  ["tired", "疲れた", "疲"],
  ["numb", "ぼんやり", "空"],
] as const;

export type Emotion = (typeof EMOTIONS)[number][0];
export const EMOTION_KEYS: readonly Emotion[] = EMOTIONS.map(([k]) => k);
export const EMOTION_NAME = Object.fromEntries(EMOTIONS.map(([k, n]) => [k, n])) as Record<Emotion, string>;
export const EMOTION_CHAR = Object.fromEntries(EMOTIONS.map(([k, , c]) => [k, c])) as Record<Emotion, string>;

export const KINDS = [
  ["book", "本"],
  ["movie", "映画"],
  ["drama", "ドラマ"],
] as const;
export type Kind = (typeof KINDS)[number][0];
export const KIND_KEYS: readonly Kind[] = KINDS.map(([k]) => k);
export const KIND_NAME = Object.fromEntries(KINDS) as Record<Kind, string>;

export const SHARES = [
  ["public", "名前つきで共有"],
  ["anon", "匿名で共有"],
  ["private", "自分だけ"],
] as const;
export type Share = (typeof SHARES)[number][0];
export const SHARE_KEYS: readonly Share[] = SHARES.map(([k]) => k);
export const SHARE_NAME = Object.fromEntries(SHARES) as Record<Share, string>;

export const AD_PLACEMENTS = [
  ["footer", "全ページの下"],
  ["reflect", "ふり返り画面"],
  ["recent", "最近の作品"],
] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number][0];
export const AD_PLACEMENT_KEYS: readonly AdPlacement[] = AD_PLACEMENTS.map(([k]) => k);
export const AD_PLACEMENT_NAME = Object.fromEntries(AD_PLACEMENTS) as Record<AdPlacement, string>;

export const MOOD_WORDS = ["", "とてもつらい", "つらい", "しんどい", "少し重い", "ふつう",
  "まあまあ", "いい感じ", "良い", "とても良い", "最高"] as const;

export const isEmotion = (v: unknown): v is Emotion => EMOTION_KEYS.includes(v as Emotion);
export const isKind = (v: unknown): v is Kind => KIND_KEYS.includes(v as Kind);
export const isShare = (v: unknown): v is Share => SHARE_KEYS.includes(v as Share);
export const isAdPlacement = (v: unknown): v is AdPlacement => AD_PLACEMENT_KEYS.includes(v as AdPlacement);
