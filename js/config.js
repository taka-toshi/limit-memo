// config.js - アプリケーション設定定数

export const CONFIG = {
  // アプリケーション情報
  APP_VERSION: '1.0.0',
  SCHEMA_VERSION: 1,
  
  // ストレージキー
  STORAGE_KEY: 'memo_data',
  SETTINGS_KEY: 'memo_settings',
  AUTH_KEY: 'auth_data',
  
  // 入力制限タイプ
  LIMIT_TYPE: {
    CHAR: 'CHAR',
    BYTE: 'BYTE'
  },
  
  // デフォルト制限値
  DEFAULT_LIMIT: {
    type: 'CHAR',
    value: 200
  },
  
  // 状態定義
  APP_STATE: {
    INIT: 'INIT',
    LOCAL_ONLY: 'LOCAL_ONLY',
    AUTHENTICATED: 'AUTHENTICATED',
    SYNCING: 'SYNCING',
    SYNCED: 'SYNCED',
    OFFLINE: 'OFFLINE'
  },
  
  // 同期制御
  SYNC: {
    MODIFIED_BY: {
      LOCAL: 'local',
      CLOUD: 'cloud'
    }
  },
  
  // GitHub Gist API
  GIST: {
    API_BASE: 'https://api.github.com',
    SCOPES: 'gist',
    // GitHub Device Flow / OAuth 用の Client ID (GitHub OAuth App の Client ID)
    CLIENT_ID: 'Ov23liuug3bKnQRzhFNI' ,
    FILENAME: 'memo.json'
  }
  ,
  // Firebase 設定（Firebase Authentication を使用する場合にここを埋める）
    // Set your Firebase Web App config here. Example values below show the
    // shape of the object — replace with values from Firebase Console → Project Settings → SDK setup.
    // NOTE: The SDK (firebase-app / firebase-auth) is loaded from CDN in index.html.
    FIREBASE: {
      // apiKey: 'AIza...your_api_key...',
      // authDomain: 'your-project.firebaseapp.com',
      // projectId: 'your-project-id',
      // appId: '1:1234567890:web:abcdef123456'
      apiKey: '',
      authDomain: '',
      projectId: '',
      appId: ''
    }
};
