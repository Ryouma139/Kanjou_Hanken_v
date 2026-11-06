/** 各画面。Django版の templates/hanken/*.html に相当。 */
import type { FC } from "hono/jsx";
import type { CalCell, EmoCount, MonthCalendar, SlopeChart, Summary, WorkRank } from "../analysis.ts";
import { dotDate, type YMD } from "../dates.ts";
import { KINDS, SHARES, type Emotion, type Kind } from "../emotions.ts";
import { emoName, kindName, signed, trend } from "../format.ts";
import type { FormState } from "../forms.ts";
import { coverUrl, delta, type DoneEntry, type Entry, type Work } from "../models.ts";
import { Ads, Errs, Layout, type PageCtx } from "./layout.tsx";
import { EmoTag, Phase, Stub } from "./parts.tsx";

/** 半券と、そこに表示する名前 */
export interface Labeled<E extends Entry = Entry> {
  e: E;
  author: string;
}

// ---------- 記録する ----------

export const RecordPage: FC<{ ctx: PageCtx; form: FormState }> = ({ ctx, form }) => {
  const v = form.values;
  const both = v.both === "on";
  const hasErrors = Object.keys(form.errors).length > 0;
  return (
    <Layout ctx={ctx} title="記録する">
      <form method="post" enctype="multipart/form-data" novalidate>
        <div class="panel">
          <div class="panel-head"><h2>作品</h2><span class="eyebrow">Work</span></div>
          <div class="segs" role="radiogroup" aria-label="種類">
            {KINDS.map(([k, name], i) => (
              <label class="seg">
                <input type="radio" name="kind" value={k} id={`id_kind_${i}`} checked={v.kind === k} />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <Errs list={form.errors.kind} />
          <label class="field" for="id_title">
            作品名
            <input type="text" name="title" id="id_title" maxlength={80} value={v.title ?? ""} placeholder="例：西の魔女が死んだ" autocomplete="off" />
          </label>
          <Errs list={form.errors.title} />
        </div>

        <div class="panel"><Phase prefix="before" title="観る前の気持ち" eyebrow="Before" form={form} maxSide={ctx.photoMaxSide} /></div>

        <label class="check">
          <input type="checkbox" name="both" id="id_both" checked={both} /> もう観終わった（観た後の気持ちも一緒に記録する）
        </label>

        <div class="panel" id="after-panel" hidden={!both}>
          <Phase prefix="after" title="観た後の気持ち" eyebrow="After" form={form} maxSide={ctx.photoMaxSide} />
        </div>

        <div class="panel">
          <div class="panel-head"><h3>共有のしかた</h3><span class="eyebrow">Share</span></div>
          <div class="segs" role="radiogroup" aria-label="共有">
            {SHARES.map(([k, name], i) => (
              <label class="seg">
                <input type="radio" name="share" value={k} id={`id_share_${i}`} checked={v.share === k} />
                <span>{name}</span>
              </label>
            ))}
          </div>
          <Errs list={form.errors.share} />
          <p class="small muted">共有すると「みんなの変化」で、同じ気持ちだった人の分析に使われます。写真やひとことも表示されます。</p>
        </div>

        <div class="actions">
          <button class="btn" type="submit" id="submit-btn" data-label-one="観る前を記録する" data-label-both="前と後を記録する">
            {both ? "前と後を記録する" : "観る前を記録する"}
          </button>
          {hasErrors && <span class="status err">入力内容を確認してください。</span>}
        </div>
      </form>
    </Layout>
  );
};

// ---------- 観た後を記録 ----------

export const AfterPage: FC<{ ctx: PageCtx; entry: Entry; form: FormState }> = ({ ctx, entry, form }) => (
  <Layout ctx={ctx} title="観た後を記録">
    <form method="post" enctype="multipart/form-data" novalidate>
      <div class="before-summary">
        <span class="kind">{kindName(entry.kind)}</span>
        <div class="minw0">
          <h3>{entry.title}</h3>
          <span class="small muted">
            観る前：<b style={`color:var(--e-${entry.beforeEmo})`}>{emoName(entry.beforeEmo)}</b>・気分{" "}
            <span class="mono">{entry.beforeMood}</span>（{dotDate(entry.beforeAt, ctx.timeZone)}）
          </span>
        </div>
      </div>

      <div class="panel"><Phase prefix="after" title="観た後の気持ち" eyebrow="After" form={form} maxSide={ctx.photoMaxSide} /></div>

      <div class="actions">
        <button class="btn" type="submit">観た後を記録する</button>
        <a class="btn ghost" href="/mine/">やめる</a>
        {Object.keys(form.errors).length > 0 && <span class="status err">入力内容を確認してください。</span>}
      </div>
    </form>
  </Layout>
);

// ---------- ふり返り ----------

export const ReflectPage: FC<{ ctx: PageCtx; entry: DoneEntry; author: string; care: string }> = ({ ctx, entry, author, care }) => {
  const d = delta(entry);
  return (
    <Layout ctx={ctx} title="ふり返り">
      <div class="reflect">
        <span class="eyebrow">Reflection</span>
        <h2>『{entry.title}』を観て</h2>
        <div class="shift">
          <EmoTag emo={entry.beforeEmo} />
          <span class="muted">→</span>
          <EmoTag emo={entry.afterEmo} />
        </div>
        <p>
          気分 <span class="mono">{entry.beforeMood}</span> → <span class="mono">{entry.afterMood}</span>
          <span class={`big mono tone-${trend(d)}`}>{signed(d)}</span>
        </p>
        <p>{care}</p>
        <div class="actions">
          <a class="btn" href="/">続けて記録する</a>
          <a class="btn ghost" href="/mine/">わたしの半券を見る</a>
          <a class="btn ghost" href={`/share/?emo=${entry.beforeEmo}`}>同じ気持ちだった人を見る</a>
        </div>
      </div>
      <Stub e={entry} author={author} own timeZone={ctx.timeZone} />
      <Ads ctx={ctx} placement="reflect" />
    </Layout>
  );
};

// ---------- わたしの半券 ----------

const Stats: FC<{ items: { v: unknown; k: string; tone?: string; unit?: string }[] }> = ({ items }) => (
  <div class="stats">
    {items.map((s) => (
      <div class="stat">
        <div class={`v mono${s.tone ? ` tone-${s.tone}` : ""}`}>{s.v}{s.unit && <span class="small">{s.unit}</span>}</div>
        <div class="k">{s.k}</div>
      </div>
    ))}
  </div>
);

const Slope: FC<{ chart: SlopeChart }> = ({ chart }) => (
  <svg class="chart" viewBox={`0 0 ${chart.w} ${chart.h}`} role="img" aria-label="観る前と観た後の気分の変化">
    {chart.ticks.map((t) => (
      <>
        <line x1={chart.x1} x2={chart.x2} y1={t.y} y2={t.y} stroke="var(--line)" stroke-width="1" />
        <text x={chart.tickX} y={t.y} dy="4" text-anchor="end" font-size="11" fill="var(--muted)" class="mono">{t.m}</text>
      </>
    ))}
    <text x={chart.x1} y={chart.labelY} text-anchor="middle" font-size="12" fill="var(--muted)">観る前</text>
    <text x={chart.x2} y={chart.labelY} text-anchor="middle" font-size="12" fill="var(--muted)">観た後</text>
    {chart.lines.map((l) => (
      <g>
        <title>{l.title}：{l.b}→{l.a}</title>
        <line x1={chart.x1} y1={l.yb} x2={chart.x2} y2={l.ya} class={`slope ${l.dir}`} stroke-width="2" />
        <circle cx={chart.x1} cy={l.yb} r="5" fill={`var(--e-${l.bEmo})`} stroke="var(--card)" stroke-width="1.5" />
        <circle cx={chart.x2} cy={l.ya} r="5" fill={`var(--e-${l.aEmo})`} stroke="var(--card)" stroke-width="1.5" />
      </g>
    ))}
  </svg>
);

export interface MineProps {
  ctx: PageCtx;
  count: number;
  open: Labeled[];
  done: Labeled[];
  stats: Summary;
  comfort: DoneEntry[];
  chart: SlopeChart;
  confirm: string;
}

export const MinePage: FC<MineProps> = ({ ctx, count, open, done, stats, comfort, chart, confirm }) => (
  <Layout ctx={ctx} title="わたしの半券">
    {count === 0 ? (
      <div class="empty-state">
        <h3>まだ半券がありません</h3>
        <p>「記録する」で作品名と観る前の気持ちを残すと、ここに半券が並びます。観終わったら、右半分に観た後の気持ちを書き足します。</p>
        <div><a class="btn" href="/">最初の半券をつくる</a></div>
      </div>
    ) : (
      <>
        {done.length > 0 && (
          <>
            <Stats
              items={[
                { v: count, k: "半券の数" },
                { v: signed(stats.avg, 1), k: "気分の平均変化", tone: trend(stats.avg) },
                { v: stats.upPct, k: "気分が上がった割合", unit: "%" },
              ]}
            />
            <div class="grid2">
              <div class="panel">
                <div class="panel-head"><h3>気分の動き</h3><span class="eyebrow">最近{chart.lines.length}件</span></div>
                <Slope chart={chart} />
              </div>
              <div class="panel">
                <div class="panel-head"><h3>心のお守り作品</h3><span class="eyebrow">Comfort</span></div>
                {comfort.length ? (
                  <div class="rank">
                    {comfort.map((e, i) => (
                      <div class="rank-row">
                        <span class="i mono">{i + 1}</span>
                        <span class="w">
                          {e.title} <span class="kind">{kindName(e.kind)}</span><br />
                          <span class="small muted">{emoName(e.beforeEmo)} → {emoName(e.afterEmo)}</span>
                        </span>
                        <span class="d mono">{signed(delta(e))}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p class="small muted">気分が上がった作品がここに並びます。落ち込んだ日に見返してみてください。</p>
                )}
              </div>
            </div>
          </>
        )}
        {open.length > 0 && (
          <>
            <h2>鑑賞中</h2>
            {open.map(({ e, author }) => <Stub e={e} author={author} own manage confirm={confirm} timeZone={ctx.timeZone} />)}
          </>
        )}
        {done.length > 0 && (
          <>
            <h2>見終わった半券</h2>
            {done.map(({ e, author }) => <Stub e={e} author={author} own manage confirm={confirm} timeZone={ctx.timeZone} />)}
          </>
        )}
      </>
    )}
  </Layout>
);

// ---------- みんなの変化 ----------

export interface ShareProps {
  ctx: PageCtx;
  total: number;
  counts?: EmoCount[];
  sel?: Emotion;
  stats?: Summary;
  dist?: (EmoCount & { pct: number })[];
  works?: WorkRank[];
  recent?: Labeled[];
}

export const SharePage: FC<ShareProps> = ({ ctx, total, counts = [], sel, stats, dist = [], works = [], recent = [] }) => (
  <Layout ctx={ctx} title="みんなの変化">
    {!total || !sel || !stats ? (
      <div class="empty-state">
        <h3>まだ共有された半券がありません</h3>
        <p>観る前と観た後の両方が記録され、「共有」になっている半券が集まると、ここで「同じ気持ちで観始めた人が、観たあとどう変わったか」を分析します。</p>
        <div><a class="btn" href="/">半券をつくる</a></div>
      </div>
    ) : (
      <>
        <div class="panel">
          <div class="panel-head"><h2>観る前、どんな気持ちでしたか？</h2><span class="eyebrow">Before</span></div>
          <div class="chips">
            {counts.map((c) => (
              <a class={`chip${c.key === sel ? " on" : ""}`} style={`--c:var(--e-${c.key})`} href={`?emo=${c.key}`} aria-current={c.key === sel ? "true" : undefined}>
                <span><i></i>{c.name} <span class="mono small muted">{c.n}</span></span>
              </a>
            ))}
          </div>
          <p class="small muted">共有された {total} 枚の半券から集計しています。</p>
        </div>

        <h2>〈<span style={`color:var(--e-${sel})`}>{emoName(sel)}</span>〉で観始めた人は、観たあと…</h2>
        <Stats
          items={[
            { v: stats.n, k: "半券" },
            { v: signed(stats.avg, 1), k: "気分の平均変化", tone: trend(stats.avg) },
            { v: stats.upPct, k: "気分が上がった人", unit: "%" },
          ]}
        />

        <div class="grid2">
          <div class="panel">
            <div class="panel-head"><h3>観た後の気持ち</h3><span class="eyebrow">After</span></div>
            <div class="bars">
              {dist.map((d) => (
                <div class="bar" style={`--c:var(--e-${d.key})`}>
                  <span>{d.name}</span>
                  <span class="track"><span class="fill" style={`width:${Math.round(d.pct)}%`}></span></span>
                  <span class="n mono">{d.n}</span>
                </div>
              ))}
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><h3>気持ちが動いた作品</h3><span class="eyebrow">Works</span></div>
            <div class="rank">
              {works.map((w, i) => (
                <div class="rank-row">
                  <span class="i mono">{i + 1}</span>
                  <span class="w">
                    {w.title} <span class="kind">{kindName(w.kind)}</span><br />
                    <span class="small muted">{w.n}人の平均</span>
                  </span>
                  <span class={`d mono ${trend(w.avg)}`}>{signed(w.avg, 1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <h2>最近の半券</h2>
        {recent.map(({ e, author }) => <Stub e={e} author={author} timeZone={ctx.timeZone} />)}
      </>
    )}
  </Layout>
);

// ---------- カレンダー ----------

export interface CalendarProps {
  ctx: PageCtx;
  year: number;
  month: number;
  ym: string;
  prev: string;
  next: string;
  isThisMonth: boolean;
  cal: MonthCalendar;
  picked: YMD | null;
  dayEntries: Labeled[];
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const CalDay: FC<{ c: CalCell; month: number; ym: string; picked: YMD | null }> = ({ c, month, ym, picked }) => {
  const cls = [!c.inMonth && "out", c.today && "today", c.inMonth && picked?.day === c.day && "on"].filter(Boolean).join(" ");
  return (
    <td class={cls || undefined}>
      {c.n ? (
        <a class="day has" href={`?m=${ym}&d=${c.day}#day`} aria-label={`${month}月${c.day}日 半券${c.n}枚`}>
          <span class="dn">{c.day}</span>
        </a>
      ) : (
        <div class="day"><span class="dn">{c.day}</span></div>
      )}
    </td>
  );
};

export const CalendarPage: FC<CalendarProps> = (p) => {
  const { ctx, cal, picked } = p;
  const pickedLabel = picked ? `${picked.month}月${picked.day}日` : "";
  return (
    <Layout ctx={ctx} title="カレンダー">
      <div class="panel">
        <div class="panel-head cal-head">
          <a class="btn ghost" href={`?m=${p.prev}`} aria-label="前の月">‹</a>
          <h2>{p.year}年{p.month}月</h2>
          <a class="btn ghost" href={`?m=${p.next}`} aria-label="次の月">›</a>
        </div>

        <table class="cal">
          <thead><tr>{WEEKDAYS.map((w) => <th scope="col">{w}</th>)}</tr></thead>
          <tbody>
            {cal.weeks.map((week) => (
              <tr>{week.map((c) => <CalDay c={c} month={p.month} ym={p.ym} picked={picked} />)}</tr>
            ))}
          </tbody>
        </table>

        <div class="cal-foot">
          <span class="small muted">色のついた日を押すと、その日に観終わった半券が表示されます（観る前と観た後がそろって1枚）。</span>
          {!p.isThisMonth && <a class="btn link" href="?">今月へ</a>}
        </div>
      </div>

      <Stats
        items={[
          { v: cal.total, k: "この月の半券" },
          { v: cal.days, k: "記録した日" },
          { v: picked ? p.dayEntries.length : "−", k: picked ? `${pickedLabel}の半券` : "日付を選ぶと表示" },
        ]}
      />

      {picked && (
        <>
          <h2 id="day">{pickedLabel}に観終わった半券</h2>
          {p.dayEntries.length ? (
            p.dayEntries.map(({ e, author }) => <Stub e={e} author={author} own timeZone={ctx.timeZone} />)
          ) : (
            <p class="muted">この日に観終わった半券はありません。</p>
          )}
        </>
      )}
    </Layout>
  );
};

// ---------- 最近の作品 ----------

export interface RecentSection {
  kind: Kind;
  name: string;
  works: Work[];
}

const WorkCard: FC<{ w: Work; i: number; s: RecentSection; timeZone: string }> = ({ w, i, s, timeZone }) => {
  const cover = coverUrl(w);
  const body = (
    <>
      <div class={`cover kind-${s.kind}`}>
        {cover ? <img src={cover} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <b>{s.name}</b>}
        <span class="no mono">{i + 1}</span>
      </div>
      <span class="work-title">
        {w.title}
        {w.url && <span class="ext" aria-label="（別のタブで開く）">↗</span>}
      </span>
      {w.note && <span class="small muted work-note">{w.note}</span>}
      <span class="small muted mono">{dotDate(w.updatedAt, timeZone)}</span>
    </>
  );
  return (
    <li class="work">
      {w.url ? (
        <a class="work-in" href={w.url} target="_blank" rel="noopener noreferrer">{body}</a>
      ) : (
        <div class="work-in">{body}</div>
      )}
    </li>
  );
};

export const RecentPage: FC<{ ctx: PageCtx; sections: RecentSection[] }> = ({ ctx, sections }) => (
  <Layout ctx={ctx} title="最近の作品">
    <div class="recent-head">
      <div>
        <span class="eyebrow">Recent works</span>
        <h2>最近の作品</h2>
      </div>
      <a class="btn sm" href="/">記録をはじめる</a>
    </div>

    {sections.map((s) => (
      <section class="panel">
        <div class="panel-head"><h3>{s.name}</h3><span class="eyebrow">{s.kind}</span></div>
        {s.works.length ? (
          <ol class="works">{s.works.map((w, i) => <WorkCard w={w} i={i} s={s} timeZone={ctx.timeZone} />)}</ol>
        ) : (
          <p class="small muted">
            まだ登録されていません。
            {ctx.user?.isStaff && <a href={`/admin/works/add/?kind=${s.kind}`}>管理画面で追加する</a>}
          </p>
        )}
      </section>
    ))}
    <Ads ctx={ctx} placement="recent" />
  </Layout>
);

// ---------- 見つからない ----------

export const NotFoundPage: FC<{ ctx: PageCtx }> = ({ ctx }) => (
  <Layout ctx={ctx} title="見つかりません">
    <div class="empty-state">
      <h3>ページが見つかりません</h3>
      <p>URLが間違っているか、半券が削除された可能性があります。</p>
      <div><a class="btn" href="/">記録する画面へ</a></div>
    </div>
  </Layout>
);

