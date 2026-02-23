// services/AuthManager.js - 外部サービス認証管理

import { CONFIG } from '../config.js';

/**
 * AuthManager - 外部サービス認証管理
 * 責務:
 * - OAuth ログイン
 * - トークン保持・更新
 * - ログイン状態判定
 */
export class AuthManager {
  constructor() {
    this.authState = 'unauthenticated'; // unauthenticated / authenticated
    this.accessToken = null;
    this._loadAuthData();
  }

  /**
   * 認証データをlocalStorageから読み込み
   * @private
   */
  _loadAuthData() {
    try {
      const stored = localStorage.getItem(CONFIG.AUTH_KEY);
      if (stored) {
        const authData = JSON.parse(stored);
        this.accessToken = authData.accessToken;
        this.authState = authData.accessToken ? 'authenticated' : 'unauthenticated';
      }
    } catch (error) {
      console.error('Failed to load auth data:', error);
    }
  }

  /**
   * 認証データをlocalStorageに保存
   * @private
   */
  _saveAuthData() {
    try {
      const authData = {
        accessToken: this.accessToken,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(CONFIG.AUTH_KEY, JSON.stringify(authData));
    } catch (error) {
      console.error('Failed to save auth data:', error);
    }
  }

  /**
    * GitHub OAuth認証を開始
    * 注意: 実際の実装では GitHub App 登録や Device Flow の利用を推奨
    * このメソッドは開発時の互換実装（Personal Access Token）であり、
    * 本番公開アプリでは `loginWithGitHubDeviceFlow()` を使用してください。
   */
  async loginWithGitHub() {
    // 本番環境では OAuth App を使用する必要がある
    // ここでは開発用に Personal Access Token を使用する想定
    
    // 開発用の簡易フロー（非推奨）: Device Flow を使ってください
    const token = prompt(
      '【開発用】GitHub Personal Access Token を入力してください（非推奨）\n' +
      '推奨: Device Flow によるログインを使用してください。\n' +
      '（gist スコープが必要です）\n\n' +
      'トークン作成（開発時のみ）:\n' +
      '1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)\n' +
      '2. "Generate new token (classic)" をクリック\n' +
      '3. "gist" にチェックを入れる\n' +
      '4. トークンを生成してコピー'
    );

    if (!token) {
      throw new Error('認証がキャンセルされました');
    }

    // トークンの検証
    try {
      const response = await fetch(`${CONFIG.GIST.API_BASE}/user`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error('無効なトークンです');
      }

      this.accessToken = token;
      this.authState = 'authenticated';
      this._saveAuthData();
      
      return true;
    } catch (error) {
      console.error('GitHub authentication failed:', error);
      throw new Error('認証に失敗しました: ' + error.message);
    }
  }

  /**
   * GitHub Device Flow による認証（推奨：公開された静的サイトでの利用）
   * - Client ID は `CONFIG.GIST.CLIENT_ID` に設定しておくこと
   */
  async loginWithGitHubDeviceFlow() {
    const clientId = CONFIG.GIST.CLIENT_ID;
    if (!clientId) {
      throw new Error('GitHub Client ID が設定されていません');
    }

    // 1) device code をリクエスト
    const params = new URLSearchParams({
      client_id: clientId,
      scope: CONFIG.GIST.SCOPES
    });

    const deviceResp = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!deviceResp.ok) {
      throw new Error('デバイスコードの取得に失敗しました');
    }

    const deviceData = await deviceResp.json();

    // ユーザーに承認手順を案内
    try {
      const message =
        'ブラウザで次のURLを開き、コードを入力してください:\n' +
        deviceData.verification_uri + '\n\nコード: ' + deviceData.user_code;
      alert(message);
      try { window.open(deviceData.verification_uri, '_blank'); } catch (e) { /* ignore */ }
    } catch (e) {
      // UI 呼び出しを失敗してもポーリングは継続
    }

    // 2) トークン取得をポーリング
    const tokenUrl = 'https://github.com/login/oauth/access_token';
    const grantBodyBase = { client_id: clientId, device_code: deviceData.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' };
    const expiresAt = Date.now() + (deviceData.expires_in || 900) * 1000;
    let interval = (deviceData.interval || 5) * 1000;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    while (Date.now() < expiresAt) {
      const body = new URLSearchParams(grantBodyBase).toString();
      const tokenResp = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
      });

      if (!tokenResp.ok) {
        throw new Error('トークン取得に失敗しました');
      }

      const tokenData = await tokenResp.json();

      if (tokenData.access_token) {
        this.accessToken = tokenData.access_token;
        this.authState = 'authenticated';
        this._saveAuthData();
        return true;
      }

      // 標準的なエラー処理
      if (tokenData.error === 'authorization_pending') {
        await sleep(interval);
        continue;
      }

      if (tokenData.error === 'slow_down') {
        interval += 5000;
        await sleep(interval);
        continue;
      }

      // その他のエラーは中断
      throw new Error(tokenData.error_description || tokenData.error || '未対応のエラーが発生しました');
    }

    throw new Error('認証がタイムアウトしました');
  }

  /**
   * ログアウト
   */
  logout() {
    this.accessToken = null;
    this.authState = 'unauthenticated';
    localStorage.removeItem(CONFIG.AUTH_KEY);
    localStorage.removeItem('gist_id');
  }

  /**
   * 認証状態を確認
   * @returns {boolean}
   */
  isAuthenticated() {
    return this.authState === 'authenticated' && this.accessToken !== null;
  }

  /**
   * アクセストークンを取得
   * @returns {string|null}
   */
  getAccessToken() {
    return this.accessToken;
  }

  /**
   * 認証状態を取得
   * @returns {string}
   */
  getAuthState() {
    return this.authState;
  }
}
