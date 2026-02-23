// controllers/AppController.js - UI と内部ロジックの仲介役

import { CONFIG } from '../config.js';
import { Memo } from '../models/Memo.js';
import { InputLimiter } from '../services/InputLimiter.js';
import { LocalStorageRepository } from '../services/LocalStorageRepository.js';
import { GistRepository } from '../services/GistRepository.js';
import { SyncManager } from '../services/SyncManager.js';
import { AuthManager } from '../services/AuthManager.js';

/**
 * AppController - UI と内部ロジックの仲介役
 * 責務:
 * - UIイベント処理
 * - 各コンポーネントの呼び出し
 * - アプリ全体の流れ制御
 */
export class AppController {
  constructor() {
    // 状態
    this.appState = CONFIG.APP_STATE.INIT;
    
    // サービス初期化
    this.inputLimiter = new InputLimiter();
    this.localRepo = new LocalStorageRepository();
    this.authManager = new AuthManager();
    this.cloudRepo = new GistRepository(this.authManager);
    this.syncManager = new SyncManager(this.localRepo, this.cloudRepo);
    
    // 現在のメモ
    this.currentMemo = null;
    
    // UI要素（initUIで設定）
    this.elements = {};
    
    // 自動同期タイマー
    this.autoSyncTimer = null;
  }

  /**
   * アプリケーション初期化
   */
  async init() {
    this.appState = CONFIG.APP_STATE.INIT;
    
    // UI初期化
    this.initUI();
    
    // Service Worker登録
    await this.registerServiceWorker();
    
    // ローカルデータ読み込み
    const localData = this.localRepo.load();
    if (localData) {
      this.currentMemo = Memo.fromJSON(localData.memo);
    } else {
      this.currentMemo = new Memo();
      this.localRepo.initialize();
    }
    
    // UI更新
    this.updateUI();
    
    // 認証状態によって状態遷移
    if (this.authManager.isAuthenticated()) {
      await this.transitionTo(CONFIG.APP_STATE.AUTHENTICATED);
      await this.initialSync();
    } else {
      await this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
    }
    
    // オンライン/オフライン監視
    this.setupNetworkMonitoring();
  }

  /**
   * UI要素の初期化とイベントリスナー設定
   */
  initUI() {
    this.elements = {
      memoInput: document.getElementById('memoInput'),
      charCount: document.getElementById('charCount'),
      byteCount: document.getElementById('byteCount'),
      limitInfo: document.getElementById('limitInfo'),
      syncStatus: document.getElementById('syncStatus'),
      loginBtn: document.getElementById('loginBtn'),
      logoutBtn: document.getElementById('logoutBtn'),
      syncBtn: document.getElementById('syncBtn'),
      limitTypeSelect: document.getElementById('limitType'),
      limitValueInput: document.getElementById('limitValue'),
      offlineIndicator: document.getElementById('offlineIndicator')
    };

    // メモ入力イベント
    this.elements.memoInput.addEventListener('input', (e) => {
      this.handleMemoInput(e.target.value);
    });

    // ログインボタン
    this.elements.loginBtn.addEventListener('click', () => {
      this.handleLogin();
    });

    // ログアウトボタン
    this.elements.logoutBtn.addEventListener('click', () => {
      this.handleLogout();
    });

    // 同期ボタン
    this.elements.syncBtn.addEventListener('click', () => {
      this.handleManualSync();
    });

    // 制限タイプ変更
    this.elements.limitTypeSelect.addEventListener('change', (e) => {
      this.handleLimitChange();
    });

    // 制限値変更
    this.elements.limitValueInput.addEventListener('change', (e) => {
      this.handleLimitChange();
    });
  }

  /**
   * メモ入力処理
   * @param {string} value
   */
  handleMemoInput(value) {
    // 入力制限チェック
    if (this.inputLimiter.isExceeded(value)) {
      value = this.inputLimiter.truncate(value);
      this.elements.memoInput.value = value;
    }

    // メモ更新
    this.currentMemo.update(value);
    
    // ローカル保存
    this.localRepo.saveMemo(this.currentMemo);
    
    // UI更新
    this.updateUI();
    
    // 自動同期スケジュール（デバウンス）
    this.scheduleAutoSync();
  }

  /**
   * ログイン処理
   */
  async handleLogin() {
    try {
      this.updateSyncStatus('認証中...');
      // Device Flow を使用
      await this.authManager.loginWithGitHubDeviceFlow();
      await this.transitionTo(CONFIG.APP_STATE.AUTHENTICATED);
      await this.initialSync();
      this.updateSyncStatus('ログイン成功');
    } catch (error) {
      console.error('Login failed:', error);
      alert('ログインに失敗しました: ' + error.message);
      this.updateSyncStatus('ログイン失敗');
    }
  }

  /**
   * ログアウト処理
   */
  handleLogout() {
    if (!confirm('ログアウトしますか？ローカルのデータは保持されます。')) {
      return;
    }
    
    this.authManager.logout();
    this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
    this.updateUI();
    this.updateSyncStatus('ログアウトしました');
  }

  /**
   * 手動同期処理
   */
  async handleManualSync() {
    if (!this.authManager.isAuthenticated()) {
      alert('同期するにはログインが必要です');
      return;
    }

    try {
      this.updateSyncStatus('同期中...');
      await this.transitionTo(CONFIG.APP_STATE.SYNCING);
      
      const success = await this.syncManager.syncToCloud();
      
      if (success) {
        await this.transitionTo(CONFIG.APP_STATE.SYNCED);
        this.updateSyncStatus('同期完了');
        
        // クラウドから再読み込みして最新化
        const cloudData = await this.cloudRepo.read();
        if (cloudData) {
          this.currentMemo = Memo.fromJSON(cloudData.memo);
          this.updateUI();
        }
      } else {
        this.updateSyncStatus('同期失敗');
      }
    } catch (error) {
      console.error('Manual sync failed:', error);
      this.updateSyncStatus('同期エラー: ' + error.message);
    }
  }

  /**
   * 入力制限変更処理
   */
  handleLimitChange() {
    const type = this.elements.limitTypeSelect.value;
    const value = parseInt(this.elements.limitValueInput.value, 10);
    
    if (value > 0) {
      this.inputLimiter.setLimit(type, value);
      
      // 現在の入力が制限を超えている場合は切り詰め
      const currentValue = this.elements.memoInput.value;
      if (this.inputLimiter.isExceeded(currentValue)) {
        const truncated = this.inputLimiter.truncate(currentValue);
        this.elements.memoInput.value = truncated;
        this.currentMemo.update(truncated);
        this.localRepo.saveMemo(this.currentMemo);
      }
      
      this.updateUI();
    }
  }

  /**
   * 初回同期
   */
  async initialSync() {
    try {
      this.updateSyncStatus('初回同期中...');
      await this.transitionTo(CONFIG.APP_STATE.SYNCING);
      
      const syncedData = await this.syncManager.initialSync();
      
      if (syncedData) {
        this.currentMemo = Memo.fromJSON(syncedData.memo);
        this.updateUI();
      }
      
      await this.transitionTo(CONFIG.APP_STATE.SYNCED);
      this.updateSyncStatus('同期完了');
    } catch (error) {
      console.error('Initial sync failed:', error);
      this.updateSyncStatus('同期エラー: ' + error.message);
    }
  }

  /**
   * 自動同期をスケジュール（デバウンス）
   */
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

  /**
   * 状態遷移
   * @param {string} newState
   */
  async transitionTo(newState) {
    this.appState = newState;
    this.updateUI();
  }

  /**
   * UI更新
   */
  updateUI() {
    // メモ表示
    if (this.currentMemo) {
      this.elements.memoInput.value = this.currentMemo.content;
    }
    
    // 文字数・バイト数表示
    const content = this.elements.memoInput.value;
    const charCount = content.length;
    const byteCount = new TextEncoder().encode(content).length;
    const usage = this.inputLimiter.calculateUsage(content);
    const remainder = this.inputLimiter.getRemainder(content);
    
    this.elements.charCount.textContent = `${charCount} 文字`;
    this.elements.byteCount.textContent = `${byteCount} バイト`;
    
    // 制限情報表示
    const limitType = this.inputLimiter.limitType === CONFIG.LIMIT_TYPE.CHAR ? '文字' : 'バイト';
    this.elements.limitInfo.textContent = 
      `制限: ${usage} / ${this.inputLimiter.limitValue} ${limitType} (残り ${remainder})`;
    
    // 残量警告
    if (remainder < 20) {
      this.elements.limitInfo.classList.add('warning');
    } else {
      this.elements.limitInfo.classList.remove('warning');
    }
    
    // 認証状態によるUI切り替え
    const isAuthenticated = this.authManager.isAuthenticated();
    this.elements.loginBtn.style.display = isAuthenticated ? 'none' : 'inline-block';
    this.elements.logoutBtn.style.display = isAuthenticated ? 'inline-block' : 'none';
    this.elements.syncBtn.style.display = isAuthenticated ? 'inline-block' : 'none';
    
    // オフライン表示
    this.elements.offlineIndicator.style.display = 
      this.appState === CONFIG.APP_STATE.OFFLINE ? 'block' : 'none';
  }

  /**
   * 同期状態表示更新
   * @param {string} message
   */
  updateSyncStatus(message) {
    this.elements.syncStatus.textContent = message;
    setTimeout(() => {
      if (this.elements.syncStatus.textContent === message) {
        this.elements.syncStatus.textContent = '';
      }
    }, 3000);
  }

  /**
   * Service Worker登録
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  /**
   * ネットワーク監視設定
   */
  setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      console.log('Network: online');
      if (this.authManager.isAuthenticated()) {
        this.transitionTo(CONFIG.APP_STATE.AUTHENTICATED);
        this.initialSync();
      } else {
        this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
      }
    });

    window.addEventListener('offline', () => {
      console.log('Network: offline');
      this.transitionTo(CONFIG.APP_STATE.OFFLINE);
    });
  }
}
