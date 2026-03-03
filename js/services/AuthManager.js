// services/AuthManager.js - 外部サービス認証管理
import { CONFIG } from '../config.js';

export class AuthManager {
  constructor() {
    this.authState = 'unauthenticated';
    this.accessToken = null; // GitHub access token

    // Initialize firebase if available and config provided
    try {
      if (globalThis.firebase && CONFIG.FIREBASE?.apiKey) {
        if (!globalThis.firebase.apps || globalThis.firebase.apps.length === 0) {
          globalThis.firebase.initializeApp(CONFIG.FIREBASE);
        }

        // Listen for Firebase auth state changes
        globalThis.firebase.auth().onAuthStateChanged(async (user) => {
          if (user) {
            // access token may not persist across sessions; we rely on localStorage backup
            const stored = localStorage.getItem(CONFIG.AUTH_KEY);
            if (stored) {
              try {
                const authData = JSON.parse(stored);
                this.accessToken = authData.accessToken || null;
              } catch (e) {
                this.accessToken = null;
              }
            }
            this.authState = 'authenticated';
          } else {
            this.accessToken = null;
            this.authState = 'unauthenticated';
          }
        });
      }
    } catch (e) {
      console.warn('Firebase init failed or not available:', e);
    }

    this._loadAuthData();
  }

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

  _saveAuthData() {
    try {
      const authData = { accessToken: this.accessToken, savedAt: new Date().toISOString() };
      localStorage.setItem(CONFIG.AUTH_KEY, JSON.stringify(authData));
    } catch (error) {
      console.error('Failed to save auth data:', error);
    }
  }

  /**
   * Firebase Authentication (GitHub) を使ってログイン
   * - `CONFIG.FIREBASE` を設定しておく必要があります
   */
  async loginWithFirebase() {
    if (!globalThis.firebase?.auth) {
      throw new Error('Firebase SDK が読み込まれていません');
    }

    // Ensure firebase initialized
    if (!globalThis.firebase.apps || globalThis.firebase.apps.length === 0) {
      if (CONFIG.FIREBASE?.apiKey) {
        globalThis.firebase.initializeApp(CONFIG.FIREBASE);
      } else {
        throw new Error('Firebase 設定がありません');
      }
    }

    const provider = new globalThis.firebase.auth.GithubAuthProvider();
    // Request gist scope
    provider.addScope('gist');

    try {
      const result = await globalThis.firebase.auth().signInWithPopup(provider);
      // OAuthCredential
      const credential = result.credential;
      const accessToken = credential?.accessToken ?? null;

      if (!accessToken) {
        throw new Error('GitHub access token を取得できませんでした');
      }

      this.accessToken = accessToken;
      this.authState = 'authenticated';
      this._saveAuthData();
      return true;
    } catch (error) {
      console.error('Firebase GitHub login failed:', error);
      throw new Error('認証に失敗しました: ' + (error.message || error));
    }
  }

  async logout() {
    try {
      if (globalThis.firebase?.auth) {
        await globalThis.firebase.auth().signOut();
      }
    } catch (e) {
      console.warn('Firebase signOut failed:', e);
    }

    this.accessToken = null;
    this.authState = 'unauthenticated';
    localStorage.removeItem(CONFIG.AUTH_KEY);
    localStorage.removeItem('gist_id');
  }

  /**
   * アカウント削除（Firebase Authentication のユーザー削除＋クライアント側データ消去）
   * - Firebase の recent login 要件でエラーが出る場合は再認証（popup）を試みます
   */
  async deleteAccount() {
    if (!globalThis.firebase?.auth) {
      throw new Error('Firebase SDK が読み込まれていません');
    }
    const user = globalThis.firebase.auth().currentUser;
    if (!user) {
      throw new Error('ログインユーザーが見つかりません');
    }

    try {
      await user.delete();
    } catch (err) {
      // 再認証が必要なケース
      if (err?.code === 'auth/requires-recent-login') {
        try {
          const provider = new globalThis.firebase.auth.GithubAuthProvider();
          provider.addScope('gist');
          await globalThis.firebase.auth().signInWithPopup(provider);
          // 再度取得して削除
          const reUser = globalThis.firebase.auth().currentUser;
          if (reUser) {
            await reUser.delete();
          } else {
            throw new Error('再認証後にユーザーが見つかりません');
          }
        } catch (reauthErr) {
          console.error('再認証に失敗しました:', reauthErr);
          throw new Error('アカウント削除に必要な再認証に失敗しました');
        }
        } else {
        console.error('ユーザー削除エラー:', err);
        throw new Error('アカウント削除に失敗しました: ' + (err?.message ?? err));
      }
    }

    // ローカルデータの消去
    try {
      localStorage.removeItem(CONFIG.AUTH_KEY);
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      localStorage.removeItem('gist_id');
    } catch (e) {
      console.warn('ローカルデータに保存されている認証情報の削除に失敗しました:', e);
    }

    this.accessToken = null;
    this.authState = 'unauthenticated';
    return true;
  }

  isAuthenticated() {
    return this.authState === 'authenticated' && this.accessToken !== null;
  }

  getAccessToken() {
    return this.accessToken;
  }

  getAuthState() {
    return this.authState;
  }
}

