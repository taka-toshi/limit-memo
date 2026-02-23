# Memo App - n文字制限メモアプリ

n文字またはnバイト制限のメモアプリケーション。PC・スマホ両対応、PWA対応、クラウド同期機能付き。

## 概要

このアプリケーションは、n文字またはnバイト制限のメモアプリです。

### 主な機能

- ✅ **入力制限**: 文字数またはバイト数での制限
- ✅ **ローカル保存**: localStorage による自動保存
- ✅ **クラウド同期**: GitHub Gist を使用した複数端末間での同期
- ✅ **PWA対応**: オフライン動作、ホーム画面追加
- ✅ **レスポンシブデザイン**: PC・スマホ両対応
- ✅ **状態管理**: ステートマシンによる状態遷移

## アーキテクチャ

### 責務分離設計

```
AppController (UI制御)
    ↓
├── Memo (ドメインモデル)
├── InputLimiter (入力制限)
├── LocalStorageRepository (ローカル保存)
├── SyncManager (同期制御)
│   ├── CloudRepository (抽象)
│   │   └── GistRepository (実装)
│   └── AuthManager (認証)
```

### ステートマシン

```
INIT → LOCAL_ONLY ⇄ OFFLINE
         ↓
    AUTHENTICATED
         ↓
      SYNCING
         ↓
      SYNCED
```

### データ構造

```json
{
  "meta": {
    "schemaVersion": 1,
    "appVersion": "1.0.0",
    "createdAt": "2026-02-10T12:00:00Z"
  },
  "memo": {
    "content": "メモ本文",
    "updatedAt": "2026-02-10T12:30:00Z"
  },
  "sync": {
    "lastSyncedAt": "2026-02-10T12:25:00Z",
    "lastModifiedBy": "local",
    "revision": 12
  }
}
```

## ファイル構成

```
memo-app/
├── index.html              # メインHTML
├── manifest.json           # PWAマニフェスト
├── sw.js                   # Service Worker
├── css/
│   └── style.css          # スタイルシート
├── js/
│   ├── config.js          # 設定定数
│   ├── app.js             # エントリーポイント
│   ├── models/
│   │   └── Memo.js        # Memoドメインオブジェクト
│   ├── services/
│   │   ├── InputLimiter.js
│   │   ├── LocalStorageRepository.js
│   │   ├── CloudRepository.js
│   │   ├── GistRepository.js
│   │   ├── SyncManager.js
│   │   └── AuthManager.js
│   └── controllers/
│       └── AppController.js
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── *.svg
```

## GitHub認証の設定

### Personal Access Token（開発用）

現在の実装では簡易的にPersonal Access Tokenを使用しています。

1. GitHub → Settings → Developer settings
2. Personal access tokens → Tokens (classic)
3. "Generate new token (classic)"
4. Note: `Memo App`
5. Expiration: 任意の期限
6. Scopes: **gist** にチェック ✅
7. "Generate token" をクリック
8. 生成されたトークンをコピー
9. アプリの「GitHub でログイン」ボタンをクリックして入力

⚠️ **注意**: トークンは安全に管理してください。

### OAuth App（本番環境推奨）

本番環境では OAuth App の使用を推奨します：

```javascript
// 実装例は AuthManager.js のコメントを参照
// サーバーレス環境では GitHub Device Flow を検討
```

## PWA インストール方法

### Chrome（PC）
1. アプリにアクセス
2. アドレスバー右側の「インストール」アイコンをクリック
3. 「インストール」を選択

### Safari（iOS）
1. アプリにアクセス
2. 共有ボタン → 「ホーム画面に追加」
3. 「追加」をタップ

### Chrome（Android）
1. アプリにアクセス
2. メニュー → 「ホーム画面に追加」
3. 「追加」をタップ

## 🔄 同期処理の流れ

### 初回同期（起動時）

```
1. ローカルデータを読み込み
2. クラウド認証を確認
3. クラウドデータを読み込み
4. 両方を比較（revision, updatedAt）
5. 新しい方を採用
6. 両方に保存
```

### 通常の同期

```
1. ユーザーがメモを編集
2. ローカルに即座に保存
3. revision を +1
4. 3秒後に自動同期（デバウンス）
5. クラウドの revision を確認
6. 衝突がなければアップロード
7. lastSyncedAt を更新
```

### 衝突解決（後勝ち）

```
if (localRevision > cloudRevision) {
  → ローカルを採用
} else if (cloudRevision > localRevision) {
  → クラウドを採用
} else {
  // revision が同じ場合
  if (localUpdatedAt > cloudUpdatedAt) {
    → ローカルを採用
  } else {
    → クラウドを採用
  }
}
```

## 設定のカスタマイズ

### 入力制限の変更

`js/config.js` で設定を変更できます：

```javascript
DEFAULT_LIMIT: {
  type: 'CHAR',    // 'CHAR' または 'BYTE'
  value: 200       // 制限値
}
```

### 自動同期間隔の変更

`js/controllers/AppController.js` の `scheduleAutoSync()` で変更：

```javascript
// 3秒後に自動同期 → 任意の秒数に変更可能
this.autoSyncTimer = setTimeout(async () => {
  // ...
}, 3000); // ← ここを変更
```

## デバッグ方法

### ローカルセットアップ
- `python -m http.server 8080` などを使用
- ブラウザで `http://localhost:8080` にアクセス

### ブラウザコンソール

```javascript
// グローバル変数からアクセス可能
window.memoApp

// 現在の状態確認
window.memoApp.appState
window.memoApp.currentMemo

// 手動同期実行
await window.memoApp.syncManager.syncToCloud()

// ローカルデータ確認
window.memoApp.localRepo.load()
```

### Service Worker

Chrome DevTools:
1. Application タブ
2. Service Workers
3. "Update" / "Unregister" で管理

## セキュリティ考慮事項

### 現在の実装

- ✅ HTTPS必須（PWA要件）
- ✅ Personal Access Token は localStorage に保存
- ❌ データは平文で保存

### 将来の拡張（暗号化）

設計上、暗号化の追加が容易です：

```javascript
// CloudRepository の前後に Encryptor を追加
class EncryptedGistRepository extends GistRepository {
  async write(data) {
    const encryptedData = await this.encryptor.encrypt(data.memo);
    return super.write({ ...data, memo: encryptedData });
  }
}
```

データ構造：
```json
{
  "meta": { ... },
  "memo": {
    "ciphertext": "...",
    "iv": "...",
    "salt": "..."
  },
  "sync": { ... }
}
```

## ブラウザ互換性（想定）

| ブラウザ | バージョン | 対応状況 |
|---------|----------|---------|
| Chrome  | 90+      | ✅ |
| Edge    | 90+      | ✅ |
| Safari  | 14+      | ✅ |
| Firefox | 88+      | ✅ |
| Opera   | 76+      | ✅ |

必要な機能:
- ES6 Modules
- Service Worker
- Web Storage
- Fetch API
- TextEncoder

## トラブルシューティング

### PWAがインストールできない

- HTTPSで配信されているか確認
- manifest.json が正しく読み込まれているか確認
- Service Worker が正常に登録されているか確認

### 同期ができない

- Personal Access Token が正しいか確認
- gist スコープが付与されているか確認
- ネットワーク接続を確認
- ブラウザコンソールでエラーを確認

### データが消えた

- localStorage は手動削除しない限り永続的
- ブラウザのプライベートモードでは使用不可
- クラウド同期していれば Gist から復元可能

## 今後の拡張案

- [ ] 暗号化の実装
- [ ] Google Drive 対応
- [ ] エクスポート機能（Markdown, TXT）
- [ ] テーマ切り替え（ダークモード）
- [ ] 音声入力対応

---

**開発者向け注意事項**

このアプリケーションは、提供された設計ドキュメントに従って実装されています：

- **システム分析.txt**: 使用技術と責務の定義
- **データ設計.txt**: データ構造とJSON形式
- **内部設計.txt**: クラス構成とステートマシン

設計変更が必要な場合は、まず設計ドキュメントを更新してから実装を変更してください。
