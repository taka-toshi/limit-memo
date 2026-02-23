# 同期処理の詳細説明

## 同期方式の概要

このアプリケーションは **クライアント主導同期** を採用しています。サーバーは単なるストレージとして機能し、同期ロジックはすべてクライアント（ブラウザ）で実行されます。

## 同期タイミング

### 1. 起動時同期（Initial Sync）

**トリガー**: アプリ起動時、認証完了時

**処理フロー**:
```
1. ローカルストレージからデータ読み込み
2. GitHub Gist からデータ読み込み
3. 両方のデータを比較
   - revision 番号で判定
   - revision が同じ場合は updatedAt で判定
4. 新しい方を採用
5. 古い方を最新データで上書き
```

**実装箇所**: `SyncManager.initialSync()`

```javascript
async initialSync() {
  const localData = this.localRepo.load();
  const cloudData = await this.cloudRepo.read();
  
  // 両方nullの場合 → 初期化
  if (!localData && !cloudData) {
    const initialData = this.localRepo.initialize();
    await this.cloudRepo.write(initialData);
    return initialData;
  }
  
  // 片方のみ存在 → 存在する方をコピー
  if (localData && !cloudData) {
    await this.cloudRepo.write(localData);
    return localData;
  }
  
  if (!localData && cloudData) {
    this.localRepo.save(cloudData);
    return cloudData;
  }
  
  // 両方存在 → 衝突解決
  const resolved = this._resolveConflict(localData, cloudData);
  
  if (resolved === localData) {
    await this.cloudRepo.write(resolved);
  } else {
    this.localRepo.save(resolved);
  }
  
  return resolved;
}
```

### 2. 編集時同期（Auto Sync）

**トリガー**: ユーザーがメモを編集した3秒後（デバウンス）

**処理フロー**:
```
1. ユーザーがメモを編集
2. ローカルストレージに即座に保存
3. revision を +1
4. lastModifiedBy を 'local' に設定
5. 3秒間追加の編集がなければ自動同期開始
6. クラウドから最新データを取得
7. 衝突チェック
8. 問題なければクラウドに書き込み
9. lastSyncedAt を更新
```

**実装箇所**: `AppController.scheduleAutoSync()`

```javascript
scheduleAutoSync() {
  if (this.autoSyncTimer) {
    clearTimeout(this.autoSyncTimer);
  }
  
  // 3秒後に自動同期
  this.autoSyncTimer = setTimeout(async () => {
    if (this.authManager.isAuthenticated() && 
        this.appState !== CONFIG.APP_STATE.OFFLINE) {
      await this.syncManager.syncToCloud();
    }
  }, 3000);
}
```

### 3. 手動同期（Manual Sync）

**トリガー**: ユーザーが「同期」ボタンをクリック

**処理フロー**:
```
1. 認証状態を確認
2. ローカルの最新データを取得
3. クラウドの最新データを取得
4. 衝突チェック
5. ローカルをクラウドに書き込み
6. クラウドからローカルに読み戻し（確認）
7. UI更新
```

## 衝突解決アルゴリズム

### 基本原則: 後勝ち（Last Write Wins）

同時編集は想定していないため、シンプルな後勝ちアルゴリズムを採用。

### 判定ロジック

```javascript
_resolveConflict(localData, cloudData) {
  const localRevision = localData.sync.revision || 0;
  const cloudRevision = cloudData.sync.revision || 0;

  // ステップ1: revision 番号で判定
  if (localRevision > cloudRevision) {
    return localData;  // ローカルが新しい
  } else if (cloudRevision > localRevision) {
    return cloudData;  // クラウドが新しい
  }

  // ステップ2: revision が同じ場合は updatedAt で判定
  const localUpdatedAt = new Date(localData.memo.updatedAt);
  const cloudUpdatedAt = new Date(cloudData.memo.updatedAt);

  if (localUpdatedAt > cloudUpdatedAt) {
    return localData;
  } else {
    return cloudData;
  }
}
```

### Revision の役割

- メモが編集されるたびに +1 される
- ローカルとクラウドで独立して管理
- 同期時に大きい方が「より多く編集された」と判断

**例**:
```
初期状態:
  Local:  revision=10
  Cloud:  revision=10

ユーザーがローカルで編集:
  Local:  revision=11  ← +1
  Cloud:  revision=10

同期実行:
  11 > 10 → ローカルが新しい
  Cloud に Local を書き込み
  
結果:
  Local:  revision=11
  Cloud:  revision=11
```

### UpdatedAt の役割

- revision が同じ場合の補助判定
- タイムスタンプによる厳密な時系列判定
- ISO8601形式で管理（ミリ秒単位）

## データフロー図

### 通常の編集フロー

```
ユーザー入力
    ↓
InputLimiter（制限チェック）
    ↓
Memo（ドメインオブジェクト更新）
    ↓
LocalStorageRepository（即座に保存）
    ↓
revision +1, lastModifiedBy='local'
    ↓
3秒待機（デバウンス）
    ↓
SyncManager.syncToCloud()
    ↓
GistRepository（GitHub Gist に書き込み）
    ↓
lastSyncedAt 更新
```

### オフライン時の編集フロー

```
ユーザー入力
    ↓
InputLimiter
    ↓
Memo
    ↓
LocalStorageRepository（保存）
    ↓
revision +1, lastModifiedBy='local'
    ↓
同期は実行されない（オフライン）
    ↓
[ネットワーク復帰]
    ↓
自動的に initialSync() 実行
    ↓
ローカルの変更をクラウドに反映
```

## 認証フロー（現在: Device Flow）

このプロジェクトでは、公開された静的サイト向けに **GitHub Device Flow** を採用しています。フローの概要は以下の通りです：

```
1. アプリがデバイスコードとユーザーコードをリクエスト
  POST https://github.com/login/device/code
2. アプリがユーザーに検証URL（https://github.com/login/device）とコードを表示
3. ユーザーが別タブでURLにアクセスし、コードを入力して承認
4. アプリがポーリングでトークンを取得
  POST https://github.com/login/oauth/access_token
5. 成功 → アクセストークンを受け取り localStorage に保存
```

メリット:
- Client Secret を不要とし、サーバーがなくても安全に認証できる
- ユーザーは GitHub 上で直接承認するためトークン漏洩リスクが低い

注意点:
- ユーザーは別タブで承認操作が必要（UX上の負担）
- トークンはブラウザに保存されるため XSS 対策は必須

## Gist API との連携

### Gist の構造

```json
{
  "id": "abc123...",
  "description": "Memo App Data",
  "public": false,
  "files": {
    "memo.json": {
      "content": "{ ... }"
    }
  }
}
```

### Read 処理

```javascript
async read() {
  const response = await fetch(
    `https://api.github.com/gists/${this.gistId}`,
    {
      headers: {
        'Authorization': `token ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    }
  );
  
  const gist = await response.json();
  const content = gist.files['memo.json'].content;
  return JSON.parse(content);
}
```

### Write 処理

```javascript
async write(data) {
  const response = await fetch(
    `https://api.github.com/gists/${this.gistId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${this.accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          'memo.json': {
            content: JSON.stringify(data, null, 2)
          }
        }
      })
    }
  );
}
```

### エラーハンドリング

- **404 Not Found**: Gist が削除された → 新規作成
- **401 Unauthorized**: トークンが無効 → 再ログイン要求
- **403 Forbidden**: レート制限 → リトライ
- **Network Error**: オフライン → ローカルのみで動作

## ネットワーク監視

### オンライン/オフライン検知

```javascript
window.addEventListener('online', () => {
  // オンライン復帰
  if (this.authManager.isAuthenticated()) {
    this.transitionTo(CONFIG.APP_STATE.AUTHENTICATED);
    this.initialSync();
  }
});

window.addEventListener('offline', () => {
  // オフライン検知
  this.transitionTo(CONFIG.APP_STATE.OFFLINE);
});
```

### 状態遷移

```
SYNCED → [ネットワーク切断] → OFFLINE
OFFLINE → [ネットワーク復帰] → AUTHENTICATED → SYNCING → SYNCED
```

## パフォーマンス最適化

### デバウンス（入力制限）

連続した入力イベントを1つにまとめる：

```javascript
handleMemoInput(value) {
  // 即座にローカル保存
  this.localRepo.saveMemo(this.currentMemo);
  
  // 同期はデバウンス（3秒後）
  this.scheduleAutoSync();
}
```

### キャッシュ戦略

Service Worker による Network First 戦略：

1. まずネットワークから取得を試みる
2. 成功 → キャッシュを更新して返す
3. 失敗 → キャッシュから返す
4. キャッシュもない → エラー

## セキュリティ考慮事項

### 現在の実装

- ✅ HTTPS必須
- ❌ データは平文
- ❌ トークンは平文で localStorage

### 将来の改善案

1. **データの暗号化**:
   ```javascript
   // Web Crypto API を使用
   const key = await crypto.subtle.generateKey(
     { name: 'AES-GCM', length: 256 },
     true,
     ['encrypt', 'decrypt']
   );
   
   const encrypted = await crypto.subtle.encrypt(
     { name: 'AES-GCM', iv },
     key,
     data
   );
   ```

2. **トークンの暗号化**:
   - IndexedDB に暗号化して保存
   - セッションキーの使用

3. **CSP ヘッダー**:
   ```
   Content-Security-Policy: 
     default-src 'self'; 
     script-src 'self'; 
     connect-src 'self' https://api.github.com
   ```

## トラブルシューティング

### 同期が失敗する

**症状**: 「同期エラー」と表示される

**原因と対処**:
1. トークンの期限切れ → 再ログイン
2. ネットワークエラー → 接続確認
3. Gistの削除 → 自動的に新規作成される

### データが古い

**症状**: 編集したはずのデータが元に戻る

**原因**: 別の端末で編集された後、同期されていない

**対処**: 手動で「同期」ボタンをクリック

### revision の不整合

**症状**: 常にクラウドが優先される

**原因**: ローカルの revision が正しく更新されていない

**対処**: ブラウザのキャッシュをクリアして再起動
