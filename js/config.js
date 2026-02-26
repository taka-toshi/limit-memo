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
    CLIENT_ID: 'Ov23lijn05y8VNP5pnRg' ,
    FILENAME: 'memo.json'
  }
  ,
  // Firebase 設定（Firebase Authentication を使用する場合にここを埋める）
  FIREBASE: {
    apiKey: "AIzaSyBtPl8g3viM2O76VXWalW8n9dPvU7Tykvs",
    authDomain: "memo-app-19bb3.firebaseapp.com",
    projectId: "memo-app-19bb3",
    appId: "1:113269673283:web:e42960566b98e36d2173f6"
  }
};
