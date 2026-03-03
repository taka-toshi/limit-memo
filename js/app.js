// app.js - アプリケーションエントリーポイント

import { AppController } from './controllers/AppController.js';

/**
 * アプリケーション起動
 */
document.addEventListener('DOMContentLoaded', async () => {
  const app = new AppController();
  await app.init();

  // グローバルからアクセス可能にする（デバッグ用）
  window.memoApp = app;
});
