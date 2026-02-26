// services/AuthManager.js - 外部サービス認証管理
import { CONFIG } from '../config.js';

export class AuthManager {
  constructor() {
    this.authState = 'unauthenticated';
    this.accessToken = null; // GitHub access token

    // Initialize firebase if available and config provided
    try {
      if (window.firebase && CONFIG.FIREBASE && CONFIG.FIREBASE.apiKey) {
        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          window.firebase.initializeApp(CONFIG.FIREBASE);
        }

        // Listen for Firebase auth state changes
        window.firebase.auth().onAuthStateChanged(async (user) => {
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
            this.authState = this.accessToken ? 'authenticated' : 'authenticated';
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
    if (!window.firebase || !window.firebase.auth) {
      throw new Error('Firebase SDK が読み込まれていません');
    }

    // Ensure firebase initialized
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (CONFIG.FIREBASE && CONFIG.FIREBASE.apiKey) {
        window.firebase.initializeApp(CONFIG.FIREBASE);
      } else {
        throw new Error('Firebase 設定がありません');
      }
    }

    const provider = new window.firebase.auth.GithubAuthProvider();
    // Request gist scope
    provider.addScope('gist');

    try {
      const result = await window.firebase.auth().signInWithPopup(provider);
      // OAuthCredential
      const credential = result.credential;
      const accessToken = credential && credential.accessToken ? credential.accessToken : null;

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
      if (window.firebase && window.firebase.auth) {
        await window.firebase.auth().signOut();
      }
    } catch (e) {
      console.warn('Firebase signOut failed:', e);
    }

    this.accessToken = null;
    this.authState = 'unauthenticated';
    localStorage.removeItem(CONFIG.AUTH_KEY);
    localStorage.removeItem('gist_id');
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

