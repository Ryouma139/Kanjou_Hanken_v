# 感情の半券（TypeScript版）

本・映画・ドラマを観る**前**と**後**の気持ちを、写真つきの「半券」に記録するアプリです。
同じ気持ちで観始めた人が、観たあとどう変わったかを集計して共有できます。

[Ryouma139/Kanjou_Hanken](https://github.com/Ryouma139/Kanjou_Hanken)（Django版）を TypeScript に置き換えたものです。画面・URL・挙動は Django 版と同じです。

## 起動方法

Node.js 22.13 以上（`node:sqlite` を使います）。

```bash
npm install
npm run createsuperuser -- admin <パスワード>   # 管理画面を使う場合（任意）
npm run dev                                       # 変更を監視して起動
```

ブラウザで http://127.0.0.1:8000/ を開き、「はじめての方はこちら」から登録します。
DB（`db.sqlite3`）とテーブルは初回起動時に自動で作られます。

- テスト: `npm test`
- 型チェック: `npm run typecheck`

## 画面

| URL | 画面 |
|---|---|
| `/` | 記録する（作品・観る前の気持ち・写真・共有範囲。「もう観終わった」で観た後も同時に記録） |
| `/entry/<id>/after/` | 観た後を記録する |
| `/entry/<id>/reflect/` | ふり返り（気持ちの変化とメンタルケアのひとこと） |
| `/mine/` | わたしの半券（平均変化・気分の動きのグラフ・心のお守り作品・共有設定の変更・削除） |
| `/share/?emo=anxious` | みんなの変化（観る前の気持ち別に、観た後の気持ちの分布・作品ランキング・最近の半券） |
| `/calendar/?m=2026-11&d=6` | カレンダー（観終わった日ごとの半券） |
| `/recent/` | 最近の作品（種類ごとに新しい10件） |
| `/accounts/login/` `/accounts/signup/` | ログイン・登録 |
| `/admin/` | 管理画面（作品・広告・半券。スタッフのみ） |

## 構成

```
src/
  server.ts          起動
  app.tsx            ミドルウェア（CSRF・ログイン・メッセージ）とURLの組み立て
  config.ts          設定（環境変数）
  db.ts              SQLite とテーブル定義
  models.ts          Entry / Work / Ad / User の型と DB 読み書き
  emotions.ts        気持ち10種・作品の種類・共有範囲の定義
  analysis.ts        集計（平均変化・分布・作品ランキング・グラフ座標・カレンダー・ケアの文言）
  forms.ts           入力の検査
  photos.ts          写真の向き補正・長辺1280px（作品画像は800px）の JPEG 化・保存
  auth.ts            パスワード（scrypt）・セッション・ひとことメッセージ
  format.ts          表示用の関数（気持ちの名前、+4/−2 表記など）
  routes/            画面ごとの処理（hanken / accounts / admin）
  views/             画面の HTML（hono/jsx）
  cli/               管理者の作成
public/hanken/       CSS と小さな JavaScript（スライダー表示・写真プレビューなど）
test/                テスト（node:test）
```

Django 版との対応：`views.py` → `routes/`、テンプレート → `views/*.tsx`、`templatetags` → `format.ts`、
Pillow → sharp、Django admin → `routes/admin.tsx`（作品・広告・半券の管理に絞ったもの）。

## 共有のルール

- **名前つきで共有**：「みんなの変化」にニックネームつきで表示・集計されます。
- **匿名で共有**：「匿名さん」として表示・集計されます。
- **自分だけ**：自分の画面にだけ表示され、集計にも使われません。

## 設定（環境変数）

| 名前 | 既定値 | 内容 |
|---|---|---|
| `PORT` / `HOST` | `8000` / `127.0.0.1` | 待ち受け |
| `HANKEN_DB` | `./db.sqlite3` | SQLite ファイル |
| `HANKEN_MEDIA_ROOT` | `./media` | アップロード写真の保存先 |
| `HANKEN_TIME_ZONE` | `Asia/Tokyo` | 日付の区切り |
| `NODE_ENV` | — | `production` で Cookie に Secure を付ける |

## 本番公開するとき

- `NODE_ENV=production` を設定し、HTTPS の裏で動かしてください。
- アップロード写真（`/media/`）はログインした人にだけ配信します。推測しにくいファイル名ですが、
  ログイン中の人なら URL を知っていれば他人の「自分だけ」の写真も見られます。厳密に守る場合は持ち主の確認を追加してください。
