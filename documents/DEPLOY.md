# デプロイガイド

このドキュメントでは、Memo Appを各種ホスティングサービスにデプロイする方法を説明します。

## 前提条件

PWAはHTTPSが必須です。以下のサービスはすべて自動的にHTTPSに対応しています。

## GitHub Pages（推奨）

### メリット
- ✅ 完全無料
- ✅ 自動HTTPS
- ✅ GitHubと統合
- ✅ カスタムドメイン対応

### デプロイ手順

#### 1. GitHubリポジトリ作成

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/your-username/memo-app.git
git push -u origin main
```

#### 2. GitHub Pages 有効化

1. リポジトリページ → Settings
2. 左メニュー → Pages
3. Source: "Deploy from a branch"
4. Branch: `main` / `/ (root)`
5. Save

#### 3. アクセス

数分後、以下のURLでアクセス可能：
```
https://your-username.github.io/memo-app/
```

※ 注意: 本プロジェクトは現在 Firebase Authentication + GitHub プロバイダを利用する実装です。デプロイ後、Firebase コンソールで GitHub プロバイダを有効化し、取得した情報を `js/config.js` の `CONFIG.FIREBASE` に設定してください。

Firebase の簡易設定手順:
1. Firebase コンソールで新しいプロジェクトを作成
2. Authentication → Sign-in method → GitHub を有効化
3. GitHub の設定画面で OAuth App を作成し、Client ID / Client Secret を取得（Callback URL は Firebase コンソールに表示されるものを使用）
4. Firebase コンソールの GitHub プロバイダ設定に Client ID / Client Secret を入力して保存
5. Firebase プロジェクトの設定から Web アプリを追加し、表示される `apiKey`, `authDomain`, `projectId`, `appId` を `js/config.js` の `CONFIG.FIREBASE` に設定
6. 保存してコミット・プッシュ

このワークフローにより、Firebase 経由で GitHub OAuth を利用でき、ブラウザ側の CORS 問題を回避できます。

### カスタムドメイン設定

1. Pages設定 → Custom domain
2. ドメイン名を入力（例: `memo.example.com`）
3. DNS設定:
   ```
   Type: CNAME
   Name: memo
   Value: your-username.github.io
   ```
4. "Enforce HTTPS" にチェック

### トラブルシューティング

**404エラー**:
- ブランチ名とフォルダを確認
- index.html がルートにあるか確認

**Service Workerエラー**:
- パスを絶対パスに変更:
  ```javascript
  navigator.serviceWorker.register('/memo-app/sw.js')
  ```

## Netlify

### メリット
- ✅ 無料プラン充実
- ✅ 自動デプロイ（Git連携）
- ✅ カスタムドメイン無料
- ✅ Forms, Functions等の追加機能

### デプロイ手順

#### 方法1: Git連携（推奨）

1. https://app.netlify.com にアクセス
2. "New site from Git"
3. GitHubアカウント連携
4. リポジトリ選択
5. Build settings:
   - Build command: （空欄）
   - Publish directory: `.`
6. "Deploy site"

#### 方法2: ドラッグ&ドロップ

1. https://app.netlify.com にアクセス
2. "Sites" → "Add new site" → "Deploy manually"
3. フォルダをドラッグ&ドロップ
4. 完了

### カスタムドメイン

1. Site settings → Domain management
2. "Add custom domain"
3. ドメイン名を入力
4. DNSレコード設定（Netlifyが自動提案）

## Vercel

### メリット
- ✅ 高速CDN
- ✅ Git連携
- ✅ プレビューデプロイ
- ✅ Edge Functions対応

### デプロイ手順

#### 方法1: CLI

```bash
# Vercel CLI インストール
npm i -g vercel

# デプロイ
cd memo-app
vercel

# 本番デプロイ
vercel --prod
```

#### 方法2: Git連携

1. https://vercel.com にアクセス
2. "New Project"
3. GitHubリポジトリをインポート
4. Framework Preset: "Other"
5. "Deploy"

### vercel.json 設定

```json
{
  "version": 2,
  "builds": [
    {
      "src": "**/*",
      "use": "@vercel/static"
    }
  ],
  "routes": [
    {
      "src": "/sw.js",
      "headers": {
        "cache-control": "public, max-age=0, must-revalidate"
      }
    },
    {
      "src": "/(.*)",
      "dest": "/$1"
    }
  ]
}
```

## Firebase Hosting

### メリット
- ✅ Googleの高速インフラ
- ✅ 無料SSL
- ✅ Firebase連携（認証、DB等）

### デプロイ手順

#### 1. Firebase CLI インストール

```bash
npm install -g firebase-tools
firebase login
```

#### 2. プロジェクト初期化

```bash
cd memo-app
firebase init hosting

# 質問に回答:
# - Public directory: .
# - Single-page app: No
# - GitHub Actions: No
```

#### 3. デプロイ

```bash
firebase deploy --only hosting
```

### firebase.json 設定

```json
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "headers": [
      {
        "source": "/sw.js",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

## Cloudflare Pages

### メリット
- ✅ 無制限の無料ビルド
- ✅ 超高速CDN
- ✅ Workers連携

### デプロイ手順

1. https://pages.cloudflare.com にアクセス
2. "Create a project"
3. GitHubリポジトリ連携
4. Build settings:
   - Build command: （空欄）
   - Build output directory: `.`
5. "Save and Deploy"

### _headers ファイル

プロジェクトルートに配置：

```
/sw.js
  Cache-Control: no-cache

/*.js
  Cache-Control: public, max-age=31536000

/*.css
  Cache-Control: public, max-age=31536000
```

## Surge.sh（シンプル）

### メリット
- ✅ 超簡単
- ✅ CLI一発デプロイ
- ✅ 無料SSL

### デプロイ手順

```bash
# インストール
npm install -g surge

# デプロイ
cd memo-app
surge

# カスタムドメイン
surge --domain memo.example.com
```

## 共通の注意点

### 1. Service Worker のパス

デプロイ先のURLパスに応じてService Workerのパスを調整：

```javascript
// GitHub Pages: /memo-app/
navigator.serviceWorker.register('/memo-app/sw.js');

// その他（ルート）: /
navigator.serviceWorker.register('/sw.js');
```

または、相対パスを使用：

```javascript
navigator.serviceWorker.register('./sw.js');
```

### 2. アセットパス

manifest.json やアイコンのパスも同様に調整：

```json
{
  "start_url": "/memo-app/",
  "icons": [
    {
      "src": "/memo-app/icons/icon-192.png",
      ...
    }
  ]
}
```

### 3. キャッシュの無効化

Service Worker を更新した際、ブラウザキャッシュをクリア：

```javascript
// sw.js
const CACHE_NAME = 'memo-app-v2'; // バージョンアップ
```

### 4. CORS設定

GitHub API は CORS対応済みですが、将来的に独自バックエンドを使用する場合：

```javascript
// サーバー側（例: Express）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://yourdomain.com');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
```

## 本番環境チェックリスト

デプロイ前に以下を確認：

- [ ] HTTPSで配信される
- [ ] manifest.json が正しく読み込まれる
- [ ] Service Worker が登録される
- [ ] アイコンが表示される
- [ ] オフラインで動作する
- [ ] GitHub認証が動作する
- [ ] 同期が正常に動作する
- [ ] レスポンシブデザインが適用される
- [ ] Lighthouse でPWAスコア90+

## パフォーマンス最適化

### 1. 画像最適化

アイコンをWebP形式でも提供：

```json
{
  "icons": [
    {
      "src": "/icons/icon-192.webp",
      "sizes": "192x192",
      "type": "image/webp"
    },
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

### 2. CSS/JS 圧縮

本番環境では圧縮版を使用：

```bash
# CSSの圧縮
npx csso css/style.css -o css/style.min.css

# JavaScriptの圧縮
npx terser js/app.js -o js/app.min.js
```

### 3. HTTP/2 Server Push（サーバー設定）

```
Link: </css/style.css>; rel=preload; as=style
Link: </js/app.js>; rel=preload; as=script
```

### 4. Cache-Control ヘッダー

```
# 静的アセット（1年キャッシュ）
Cache-Control: public, max-age=31536000, immutable

# Service Worker（キャッシュしない）
Cache-Control: no-cache
```

## 監視とメンテナンス

### 1. アクセス解析

Google Analytics 4 を追加：

```html
<!-- index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### 2. エラー監視

Sentry等のエラー監視サービス：

```javascript
// app.js
import * as Sentry from "@sentry/browser";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: "production"
});
```

### 3. アップタイム監視

- UptimeRobot
- Pingdom
- StatusCake

## トラブルシューティング

### Service Worker が更新されない

```javascript
// 強制更新
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister());
});
```

### manifest.json が読み込まれない

1. MIME type確認: `application/manifest+json`
2. パス確認: 絶対パスに変更
3. CORS確認: 同一オリジンから配信

### アイコンが表示されない

1. サイズ確認: 192x192, 512x512
2. フォーマット確認: PNG
3. パス確認: 絶対パス推奨

### オフラインで動作しない

1. Service Worker 登録確認
2. キャッシュ内容確認
3. ネットワーク戦略見直し

## カスタムドメインのDNS設定

### GitHub Pages

```
Type: CNAME
Name: memo (または www)
Value: your-username.github.io
TTL: 3600
```

### Netlify

Netlifyが提供するネームサーバーを使用するか：

```
Type: A
Name: @
Value: 75.2.60.5
TTL: 3600

Type: CNAME
Name: www
Value: your-site.netlify.app
TTL: 3600
```

### Vercel

```
Type: CNAME
Name: memo
Value: cname.vercel-dns.com
TTL: 3600
```

## 継続的デプロイ（CI/CD）

### GitHub Actions

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
```

### Netlify（自動）

GitHubにpushするだけで自動デプロイされます。

## まとめ

推奨デプロイ方法:

1. **初心者**: GitHub Pages
2. **本格運用**: Netlify / Vercel
3. **Firebase連携**: Firebase Hosting
4. **高速重視**: Cloudflare Pages

すべて無料で始められ、HTTPS自動対応、優れたパフォーマンスを提供します。
