# 感情の半券（TypeScript版）

本・映画・ドラマを観る**前**と**後**の気持ちを、写真つきの「半券」に記録するアプリです。
同じ気持ちで観始めた人が、観たあとどう変わったかを集計して共有できます。

[Ryouma139/Kanjou_Hanken](https://github.com/Ryouma139/Kanjou_Hanken)（Django版）を TypeScript に置き換え、
**Cloudflare Workers + Neon（PostgreSQL）+ R2** で公開できるようにしたものです。画面・URL・挙動は Django 版と同じです。

## 構成

| 役割 | 本番（Cloudflare） | 手元（`npm run dev`） | テスト |
|---|---|---|---|
| アプリ | Cloudflare Workers（Hono） | Node（Hono） | Node |
| DB | Neon（PostgreSQL） | PGlite（`.pglite/` フォルダ） | PGlite（メモリ） |
| 写真 | R2 | `media/` フォルダ | メモリ |
| CSS・JS | Workers Static Assets | Node から配信 | — |

写真は**送る前にブラウザで**向きを直し、長辺1280px（作品画像は800px）の JPEG に縮小します。
サーバーは中身が本当に画像か（JPEG / PNG / WebP / GIF）を確かめて保存するだけです。

## 手元で動かす

Node.js 22.13 以上。

```bash
npm install
npm run dev                                       # http://127.0.0.1:8000/
npm run createsuperuser -- admin <パスワード>     # 管理画面を使う場合（任意）
```

DB は `.pglite/`、写真は `media/` に保存されます（どちらも初回に自動で作られます）。
ポートを変えるときは `PORT=3000`（PowerShell では `$env:PORT='3000'`）。

- テスト: `npm test`
- 型チェック: `npm run typecheck`

## Cloudflare に公開する

### 1. Neon で DB を作る
1. https://neon.tech でプロジェクトを作る（リージョンは日本に近いところ。例：Singapore）。
2. 「Connection string」をコピーする（`postgresql://…neon.tech/neondb?sslmode=require`）。
3. テーブルを作る：
   ```bash
   # bash
   DATABASE_URL='postgresql://...' npm run db:migrate
   # PowerShell
   $env:DATABASE_URL='postgresql://...'; npm run db:migrate
   ```

### 2. Cloudflare の準備
```bash
npx wrangler login                                   # ブラウザで Cloudflare にログイン
npx wrangler r2 bucket create kanjou-hanken-media    # 写真の置き場所
npx wrangler secret put DATABASE_URL                 # 1. の接続文字列を貼り付ける
```

### 3. 公開
```bash
npm run deploy
```
`https://kanjou-hanken.<アカウント名>.workers.dev` で開けます。独自ドメインは Cloudflare のダッシュボードの
Workers → kanjou-hanken → Settings → Domains & Routes から設定できます。

### 4. 管理者を作る
```bash
DATABASE_URL='postgresql://...' npm run createsuperuser -- admin <パスワード>
```

### 更新するとき
コードを直したら `npm run deploy`。テーブルを変えたときは先に `npm run db:migrate`（DATABASE_URL つき）。

### Cloudflare の環境で手元確認したいとき
`.dev.vars.example` を `.dev.vars` にコピーして Neon の**開発用ブランチ**の接続文字列を書き、`npm run dev:cf`。
R2 は手元のシミュレーターが使われます。

### 費用の目安（最新の料金は各サービスで確認してください）
- **Workers**：無料プランは1リクエストあたりの CPU 時間が 10ms まで。ログイン・登録のパスワード照合（PBKDF2 10万回）は
  これを超えることがあるため、**有料プラン（月 $5）**をおすすめします。
- **Neon**：無料枠あり。小規模ならまず収まります。
- **R2**：10GB まで無料、外への転送料なし。

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

## ソースの構成

```
src/
  worker.ts          Cloudflare Workers の入り口（Neon + R2）
  server.ts          手元の入り口（Node。PGlite + フォルダ）
  app.tsx            ミドルウェア（CSRF・ログイン・メッセージ）と URL の組み立て。どちらの入り口からも使う
  db.ts              DB の窓口とテーブル定義（db-neon.ts / db-pglite.ts が実体）
  storage.ts         写真の置き場所（R2 / メモリ。storage-fs.ts はフォルダ）
  models.ts          Entry / Work / Ad / User の型と DB 読み書き
  emotions.ts        気持ち10種・作品の種類・共有範囲の定義
  analysis.ts        集計（平均変化・分布・作品ランキング・グラフ座標・カレンダー・ケアの文言）
  forms.ts           入力の検査
  photos.ts          画像の種類の確認と保存
  auth.ts            パスワード（PBKDF2）・セッション・ひとことメッセージ（Web 標準の API だけを使用）
  format.ts          表示用の関数（気持ちの名前、+4/−2 表記など）
  routes/            画面ごとの処理（hanken / accounts / admin）
  views/             画面の HTML（hono/jsx）
  cli/               テーブル作成・管理者の作成
public/static/hanken/  CSS と JavaScript（スライダー表示・写真の縮小とプレビューなど）
test/                テスト（node:test）
wrangler.toml        Cloudflare の設定
```

## 共有のルール

- **名前つきで共有**：「みんなの変化」にニックネームつきで表示・集計されます。
- **匿名で共有**：「匿名さん」として表示・集計されます。
- **自分だけ**：自分の画面にだけ表示され、集計にも使われません。写真も持ち主にしか配信しません。
