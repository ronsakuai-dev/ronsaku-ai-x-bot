# 論作AI X自動投稿ボット

@ronsaku_ai の X (Twitter) 自動投稿システム。
Google Sheets で管理したポストをブラウザ自動操作で投稿する。月90投稿を完全自動化。

---

## 前提条件

- Node.js 20 以上
- Git
- Google アカウント (Google Cloud Console にアクセスできること)
- @ronsaku_ai の X アカウントのパスワード

---

## セットアップ手順

### Step 1: GitHub に Private リポジトリを作成する

1. GitHub にログイン → `New repository`
2. Repository name: `ronsaku-ai-x-bot`
3. **必ず `Private` を選択** (Publicにすると認証情報が漏洩するリスクがある)
4. `Create repository` をクリック

ローカルでリポジトリを初期化:

```bash
cd /Users/natsuki/Desktop/ronsaku-ai-x-bot
git init
git remote add origin https://github.com/YOUR_USERNAME/ronsaku-ai-x-bot.git
git add .
git commit -m "initial commit"
git push -u origin main
```

---

### Step 2: ローカルに依存関係をインストールする

```bash
cd /Users/natsuki/Desktop/ronsaku-ai-x-bot
npm install
npx playwright install chromium
```

---

### Step 3: X.com にログインして .auth.json を生成する

```bash
npm run login
```

Chromium が起動するので、@ronsaku_ai アカウントで X.com にログインする。
ログイン完了後、ターミナルに戻って `Enter` を押す。
`.auth.json` がプロジェクトルートに生成される。

**注意**: `.auth.json` は絶対に Git にコミットしない (.gitignore に含まれている)。

---

### Step 4: .auth.json を GitHub Secrets に登録する

```bash
# Mac の場合: base64 エンコードしてクリップボードにコピー
base64 -i .auth.json | pbcopy

# Windows の場合:
# base64 .auth.json | clip
```

GitHub リポジトリ → Settings → Secrets and variables → Actions → `New repository secret`

| Secret 名 | 値 |
|---|---|
| `X_AUTH_JSON_B64` | 上でコピーした base64 文字列 |

---

### Step 5: Google Cloud Console でサービスアカウントを作成する

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成(または既存のものを使用)
3. 左メニュー → `APIs & Services` → `Enabled APIs & services`
4. `+ Enable APIs and Services` をクリック
5. `Google Sheets API` を検索して有効化

サービスアカウントを作成:

1. 左メニュー → `IAM & Admin` → `Service Accounts`
2. `+ Create Service Account` をクリック
3. 名前: `ronsaku-x-bot` など
4. `Create and continue` → `Done`
5. 作成したサービスアカウントをクリック
6. `Keys` タブ → `Add Key` → `Create new key` → `JSON` → ダウンロード
7. ダウンロードした JSON ファイルを `.sa.json` としてプロジェクトルートに配置

```bash
# ダウンロードしたファイルをリネームして配置 (パスは実際に合わせる)
cp ~/Downloads/your-project-xxxxx.json /Users/natsuki/Desktop/ronsaku-ai-x-bot/.sa.json
```

---

### Step 6: サービスアカウントを Google Sheets に共有する

1. Google Sheets を開く
2. 右上の `共有` ボタンをクリック
3. サービスアカウントのメールアドレスを入力 (例: `ronsaku-x-bot@your-project.iam.gserviceaccount.com`)
4. 権限を `編集者` に設定して `完了`

サービスアカウントのメールアドレスは Google Cloud Console → Service Accounts 画面で確認できる。

---

### Step 7: .sa.json を GitHub Secrets に登録する

```bash
# Mac の場合
base64 -i .sa.json | pbcopy
```

GitHub → Settings → Secrets → `New repository secret`

| Secret 名 | 値 |
|---|---|
| `GOOGLE_SA_JSON_B64` | 上でコピーした base64 文字列 |

---

### Step 8: Sheet ID を GitHub Secrets に登録する

Google Sheets の URL から Sheet ID を取得:

```
https://docs.google.com/spreadsheets/d/【ここがSheet ID】/edit
```

GitHub → Settings → Secrets → `New repository secret`

| Secret 名 | 値 |
|---|---|
| `SHEET_ID` | 上で取得した Sheet ID |

---

### Step 9: Google Sheets の構造を作成する

1行目にヘッダーを以下の列順で入力:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| 投稿予定日時 | 時間帯 | カテゴリ | 本文 | 画像URL | 承認 | 投稿済 | 投稿後URL | いいね数 | RT数 |

投稿データの入力例 (2行目以降):

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| 2026-05-10T07:00:00+09:00 | 朝 | 論作文Tips | 【教員採用試験】論作文で差がつく「具体例の入れ方」... | (空欄) | TRUE | FALSE |

- **A列**: ISO 8601形式で入力 (例: `2026-05-10T07:00:00+09:00`)
- **F列(承認)**: 投稿してOKなら `TRUE`、まだなら `FALSE`
- **G列(投稿済)**: 自動で `TRUE` になる、手動変更不要
- **H列〜**: 自動記入される

---

### Step 10: GitHub Actions を有効化する

1. GitHub リポジトリ → `Actions` タブ
2. `I understand my workflows, go ahead and enable them` をクリック
3. 左サイドバーに `X Auto Post` が表示されていれば完了

15分ごと (`0,15,30,45 * * * *`) に自動実行される。
手動実行は `Actions` → `X Auto Post` → `Run workflow` から可能。

---

## Secrets 一覧 (最終確認)

GitHub → Settings → Secrets and variables → Actions に以下3つが揃っていることを確認:

| Secret 名 | 内容 |
|---|---|
| `X_AUTH_JSON_B64` | .auth.json の base64 エンコード |
| `GOOGLE_SA_JSON_B64` | .sa.json の base64 エンコード |
| `SHEET_ID` | Google Sheets の ID |

---

## 運用ルール・凍結対策

### 初週は段階的に増やす

| 期間 | 投稿数 |
|---|---|
| 1〜3日目 | 1日1投稿で様子見 |
| 4〜7日目 | 1日2投稿に増やす |
| 2週目以降 | 1日3投稿(朝/昼/夜) |

急に投稿数を増やすと凍結リスクが上がる。段階的に増やすこと。

### Cookie 失効時の対処

Actions が失敗し、ログに「Cookie が失効している可能性があります」と出た場合:

```bash
cd /Users/natsuki/Desktop/ronsaku-ai-x-bot
npm run login
# 再度 .auth.json を生成 → base64 → GitHub Secrets を更新
base64 -i .auth.json | pbcopy
```

GitHub Secrets の `X_AUTH_JSON_B64` を新しい値で上書きする。

### 通知の受け取り方

Actions が失敗すると GitHub から登録メール (`natsu0608prr@gmail.com`) に通知が届く。
Settings → Notifications で通知設定を確認すること。

---

## ローカルでのテスト実行

```bash
# 型チェック
npm run typecheck

# 実際に投稿を試す (Sheetsに承認済の行が必要)
SHEET_ID=your_sheet_id npm run post
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `ログインが確認できませんでした` | Cookie 失効 | `npm run login` で再生成 |
| `SHEET_ID が設定されていません` | Secrets 未設定 | GitHub Secrets を確認 |
| `Sheets の取得に失敗` | サービスアカウント権限不足 | Sheets への共有設定を確認 |
| Actions が実行されない | Workflows が無効 | Actions タブで有効化 |
| 投稿が重複する | 同時実行 | Actions の同時実行制限は `timeout-minutes: 5` で対応済み |
