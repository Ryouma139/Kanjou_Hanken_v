/** 画面の部品。Django版の _phase.html / _half.html / _stub.html に相当。 */
import type { FC } from "hono/jsx";
import { dotDate } from "../dates.ts";
import { EMOTIONS, type Emotion } from "../emotions.ts";
import { emoChar, emoName, kindName, moodWord, signed, trend } from "../format.ts";
import type { FormState } from "../forms.ts";
import { NOTE_PLACEHOLDER } from "../forms.ts";
import { coverUrl, delta, isDone, mediaUrl, type Entry } from "../models.ts";
import { Errs } from "./layout.tsx";

const emoVar = (k: string) => `--c:var(--e-${k})`;

/** 観る前／観た後の入力ブロック（気持ち・気分・写真・ひとこと） */
export const Phase: FC<{ prefix: "before" | "after"; title: string; eyebrow: string; form: FormState }> = ({
  prefix, title, eyebrow, form,
}) => {
  const n = (f: string) => `${prefix}_${f}`;
  const id = (f: string) => `id_${n(f)}`;
  const sel = form.values[n("emo")] ?? "";
  const mood = form.values[n("mood")] || "5";
  return (
    <>
      <div class="panel-head"><h2>{title}</h2><span class="eyebrow">{eyebrow}</span></div>
      <div class="chips" role="radiogroup" aria-label={title}>
        {EMOTIONS.map(([key, name], i) => (
          <label class="chip" style={emoVar(key)}>
            <input type="radio" name={n("emo")} value={key} id={`${id("emo")}_${i}`} checked={sel === key} />
            <span><i></i>{name}</span>
          </label>
        ))}
      </div>
      <Errs list={form.errors[n("emo")]} />
      <div>
        <div class="mood">
          <label class="small" for={id("mood")}>気分</label>
          <input type="range" name={n("mood")} id={id("mood")} min="1" max="10" step="1" value={mood} />
          <output class="mono" data-mood-out={id("mood")}>{mood} / 10</output>
        </div>
        <div class="mood-hint">
          <span>1 とてもつらい</span><span data-mood-word={id("mood")}>{moodWord(mood)}</span><span>10 最高</span>
        </div>
        <Errs list={form.errors[n("mood")]} />
      </div>
      <div class="photo-row">
        <div class="photo-prev" data-preview-for={id("photo")}></div>
        <div class="photo-side">
          <label class="filebtn">
            <input type="file" name={n("photo")} id={id("photo")} accept="image/*" />写真を選ぶ
          </label>
          <span class="small muted">そのときの景色や表情、気持ちに近いイメージを一枚。なくても大丈夫です。</span>
          <Errs list={form.errors[n("photo")]} />
        </div>
      </div>
      <label class="field" for={id("note")}>
        ひとこと
        <textarea name={n("note")} id={id("note")} rows={3} cols={40} maxlength={300} placeholder={NOTE_PLACEHOLDER[prefix]}>
          {form.values[n("note")] ?? ""}
        </textarea>
      </label>
      <Errs list={form.errors[n("note")]} />
    </>
  );
};

/** 半券の片側 */
const Half: FC<{ lbl: string; emo: Emotion | ""; mood: number | null; note: string; photo: string }> = ({
  lbl, emo, mood, note, photo,
}) => (
  <div class="half">
    <span class="lbl">{lbl}</span>
    {emo ? (
      <>
        {photo ? (
          <div class="tile" style={emoVar(emo)}>
            <img src={mediaUrl(photo)} alt={`${lbl}の写真`} loading="lazy" />
          </div>
        ) : (
          <div class="tile emo" style={emoVar(emo)}><b>{emoChar(emo)}</b></div>
        )}
        <div class="meta">
          <span class="emo-tag" style={emoVar(emo)}><i></i>{emoName(emo)}</span>
          <span class="score mono">{mood}<span class="muted small">/10</span></span>
        </div>
        {note && <p class="note">{note}</p>}
      </>
    ) : (
      <div class="tile empty">まだ</div>
    )}
  </div>
);

export interface StubProps {
  e: Entry;
  timeZone: string;
  /** 表示する名前（「あなた」「匿名さん」など） */
  author: string;
  /** 自分の半券として描く */
  own?: boolean;
  /** 共有設定の変更・削除を出す */
  manage?: boolean;
  /** 削除の確認中の半券 id */
  confirm?: string;
}

/** 1枚の半券 */
export const Stub: FC<StubProps> = ({ e, timeZone, author, own, manage, confirm }) => {
  const done = isDone(e);
  const d = delta(e);
  const cover = coverUrl(e.work);
  const link = e.work?.url;
  return (
    <article class="stub" id={`e${e.id}`}>
      <div class="stub-head">
        <div class="t">
          {cover && (
            <span class="stub-cover"><img src={cover} alt="" loading="lazy" referrerpolicy="no-referrer" /></span>
          )}
          <span class="kind">{kindName(e.kind)}</span>
          <h3>
            {link ? (
              <a href={link} target="_blank" rel="noopener noreferrer">
                {e.title}<span class="ext" aria-label="（別のタブで開く）">↗</span>
              </a>
            ) : (
              e.title
            )}
          </h3>
        </div>
        <span class="small muted mono">{dotDate(e.createdAt, timeZone)}</span>
      </div>
      <Half lbl="BEFORE" emo={e.beforeEmo} mood={e.beforeMood} note={e.beforeNote} photo={e.beforePhoto} />
      <div class="perf">
        <span class={`delta mono ${trend(d)}`}>{done ? signed(d) : "鑑賞中"}</span>
      </div>
      <Half lbl="AFTER" emo={e.afterEmo} mood={e.afterMood} note={e.afterNote} photo={e.afterPhoto} />

      <div class="stub-foot">
        {own ? (
          <>
            {done ? <span class="muted">{author}</span> : <a class="btn sm" href={`/entry/${e.id}/after/`}>観た後を記録する</a>}
            {manage && (
              <span class="actions">
                <form method="post" action={`/entry/${e.id}/share/`} class="inline">
                  <label class="small muted" for={`sh-${e.id}`}>共有</label>
                  <select name="share" id={`sh-${e.id}`} data-autosubmit>
                    <option value="public" selected={e.share === "public"}>名前つき</option>
                    <option value="anon" selected={e.share === "anon"}>匿名</option>
                    <option value="private" selected={e.share === "private"}>自分だけ</option>
                  </select>
                  <noscript><button class="btn link" type="submit">変更</button></noscript>
                </form>
                {confirm === String(e.id) ? (
                  <form method="post" action={`/entry/${e.id}/delete/`} class="inline">
                    <span class="small">この半券を削除しますか？</span>
                    <button class="btn danger" type="submit">削除する</button>
                    <a class="btn link" href={`/mine/#e${e.id}`}>やめる</a>
                  </form>
                ) : (
                  <a class="btn link" href={`?confirm=${e.id}#e${e.id}`}>削除</a>
                )}
              </span>
            )}
          </>
        ) : (
          <span class="muted">{author}</span>
        )}
      </div>
    </article>
  );
};

/** 気持ちのタグ（色つきの丸＋名前） */
export const EmoTag: FC<{ emo: Emotion | "" }> = ({ emo }) => (
  <span class="emo-tag" style={emoVar(emo)}><i></i>{emoName(emo)}</span>
);

