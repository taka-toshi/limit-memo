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
   * 注意: 実際の実装ではGitHub App登録が必要
   * このメソッドは Personal Access Token による簡易実装
   */
  async loginWithGitHub() {
    // 本番環境では OAuth App を使用する必要がある
    // ここでは開発用に Personal Access Token を使用する想定
    
    const token = prompt(
      'GitHub Personal Access Token を入力してください\n' +
      '（gist スコープが必要です）\n\n' +
      'トークンの作成方法:\n' +
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

/**
 * OAuth App を使用する場合の実装例（参考）
 * 
 * GitHub OAuth App の設定:
 * 1. GitHub → Settings → Developer settings → OAuth Apps
 * 2. New OAuth App
 * 3. Application name: 任意の名前
 * 4. Homepage URL: https://yourdomain.com
 * 5. Authorization callback URL: https://yourdomain.com/callback
 * 6. Client ID と Client Secret を取得
 * 
 * 実装の流れ:
 * 1. ユーザーを GitHub 認証ページにリダイレクト
 *    https://github.com/login/oauth/authorize?client_id=YOUR_CLIENT_ID&scope=gist
 * 
 * 2. コールバックURLでコードを受け取る
 *    https://yourdomain.com/callback?code=AUTHORIZATION_CODE
 * 
 * 3. サーバーサイドでコードをトークンに交換
 *    POST https://github.com/login/oauth/access_token
 *    パラメータ: client_id, client_secret, code
 * 
 * 注意: Client Secret はフロントエンドに含めてはいけない
 * サーバーレスの場合は GitHub App + Device Flow の使用を検討
 */
