// app.js - アプリケーションエントリーポイント

import { AppController } from './controllers/AppController.js';

/**
 * アプリケーション起動
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Memo App starting...');
  
  const app = new AppController();
  await app.init();
  
  console.log('Memo App initialized');
  
  // グローバルからアクセス可能にする（デバッグ用）
  window.memoApp = app;
});
