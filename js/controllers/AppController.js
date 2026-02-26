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
    
    // 設定（制限タイプ/制限値）を読み込む
    try {
      const storedSettings = localStorage.getItem(CONFIG.SETTINGS_KEY);
      if (storedSettings) {
        const s = JSON.parse(storedSettings);
        if (s && typeof s.limitType === 'string' && typeof s.limitValue === 'number') {
          this.inputLimiter.setLimit(s.limitType, s.limitValue);
          // UI反映
          this.elements.limitTypeSelect.value = s.limitType;
          this.elements.limitValueInput.value = s.limitValue;
        }
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
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
      deleteAccountBtn: document.getElementById('deleteAccountBtn'),
      clearMemoBtn: document.getElementById('clearMemoBtn'),
      clearMemoConfirm: document.getElementById('clearMemoConfirm'),
      confirmClearMemoBtn: document.getElementById('confirmClearMemoBtn'),
      cancelClearMemoBtn: document.getElementById('cancelClearMemoBtn'),
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

    // アカウント削除ボタン
    if (this.elements.deleteAccountBtn) {
      this.elements.deleteAccountBtn.addEventListener('click', () => {
        this.handleAccountDelete();
      });
    }

    // ローカルデータ削除（インページ確認）
    if (this.elements.clearMemoBtn) {
      this.elements.clearMemoBtn.addEventListener('click', () => {
        if (this.elements.clearMemoConfirm) this.elements.clearMemoConfirm.style.display = 'block';
      });
    }

    if (this.elements.cancelClearMemoBtn) {
      this.elements.cancelClearMemoBtn.addEventListener('click', () => {
        if (this.elements.clearMemoConfirm) this.elements.clearMemoConfirm.style.display = 'none';
      });
    }

    if (this.elements.confirmClearMemoBtn) {
      this.elements.confirmClearMemoBtn.addEventListener('click', () => {
        this.handleClearMemo();
      });
    }

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
      // Firebase GitHub 認証を使用
      await this.authManager.loginWithFirebase();
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
          // cloud に含まれる settings があれば InputLimiter と UI に反映
          if (cloudData.settings) {
            try {
              const s = cloudData.settings;
              this.inputLimiter.setLimit(s.limitType || CONFIG.DEFAULT_LIMIT.type, s.limitValue || CONFIG.DEFAULT_LIMIT.value);
              // UI要素も更新
              if (this.elements.limitTypeSelect) this.elements.limitTypeSelect.value = this.inputLimiter.limitType;
              if (this.elements.limitValueInput) this.elements.limitValueInput.value = this.inputLimiter.limitValue;
              // 永続化して localRepo と整合させる
              try {
                const existing = this.localRepo.load() || this.localRepo._createInitialData();
                existing.settings = { limitType: this.inputLimiter.limitType, limitValue: this.inputLimiter.limitValue };
                this.localRepo.save(existing);
              } catch (e) {
                console.warn('Failed to persist cloud settings locally:', e);
              }
            } catch (e) {
              console.warn('Failed to apply cloud settings:', e);
            }
          }
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
   * アカウント削除処理
   */
  async handleAccountDelete() {
    if (!confirm('アカウントを完全に削除しますか？この操作は取り消せません。')) {
      return;
    }

    try {
      this.updateSyncStatus('アカウント削除中...');
      await this.authManager.deleteAccount();

      // ローカルのメモデータも初期化
      this.localRepo.clear();
      this.currentMemo = new Memo();
      this.localRepo.initialize();

      await this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
      this.updateUI();
      this.updateSyncStatus('アカウントを削除しました');
      alert('アカウントおよびローカルデータを削除しました');
    } catch (error) {
      console.error('Account delete failed:', error);
      alert('アカウント削除に失敗しました: ' + (error.message || error));
      this.updateSyncStatus('アカウント削除失敗');
    }
  }

  /**
   * ローカルメモ削除（ユーザー操作：インページ確認で実行）
   */
  async handleClearMemo() {
    try {
      if (this.elements.clearMemoConfirm) this.elements.clearMemoConfirm.style.display = 'none';
      this.updateSyncStatus('ローカルデータ削除中...');

      // ローカルのメモデータを削除/初期化
      try {
        this.localRepo.clear();
        this.localRepo.initialize();
      } catch (e) {
        console.warn('localRepo clear/initialize failed:', e);
      }

      // メモ内容をクリア
      this.currentMemo = new Memo();

      // 入力制限（タイプ・値）をデフォルトに戻す
      try {
        this.inputLimiter.setLimit(CONFIG.DEFAULT_LIMIT.type, CONFIG.DEFAULT_LIMIT.value);
        this.elements.limitTypeSelect.value = CONFIG.DEFAULT_LIMIT.type;
        this.elements.limitValueInput.value = CONFIG.DEFAULT_LIMIT.value;
        localStorage.removeItem(CONFIG.SETTINGS_KEY);
      } catch (e) {
        console.warn('Failed to reset settings:', e);
      }

      // GitHub 連携情報を削除（アクセストークン・gist id 等）
      try {
        // AuthManager.logout() は Firebase のサインアウトと localStorage 削除を行う
        if (this.authManager && typeof this.authManager.logout === 'function') {
          await this.authManager.logout();
        } else {
          localStorage.removeItem(CONFIG.AUTH_KEY);
          localStorage.removeItem('gist_id');
        }
      } catch (e) {
        console.warn('Failed to remove auth data:', e);
        // フォールバックで手動削除
        try { localStorage.removeItem(CONFIG.AUTH_KEY); localStorage.removeItem('gist_id'); } catch (_) {}
      }

      // UI をログイン可能なローカルのみの状態へ
      await this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
      this.updateUI();

      this.updateSyncStatus('ローカルデータを削除しました');
      alert('ローカルに保存されたメモと設定、GitHub連携を削除しました');
    } catch (error) {
      console.error('Clear memo failed:', error);
      alert('ローカルデータ削除に失敗しました: ' + (error.message || error));
      this.updateSyncStatus('ローカルデータ削除失敗');
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
      // 設定をローカルデータ構造へ永続化（クラウド同期の対象にする）
      try {
        const existing = this.localRepo.load() || this.localRepo._createInitialData();
        existing.settings = { limitType: type, limitValue: value };
        existing.sync.lastModifiedBy = CONFIG.SYNC.MODIFIED_BY.LOCAL;
        existing.sync.revision = (existing.sync.revision || 0) + 1;
        this.localRepo.save(existing);
      } catch (e) {
        console.error('Failed to save settings into localRepo:', e);
        // フォールバックで従来通り別キーにも保存
        try { localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify({ limitType: type, limitValue: value })); } catch (_) {}
      }
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
        // 同期された settings を反映
        if (syncedData.settings) {
          try {
            const s = syncedData.settings;
            this.inputLimiter.setLimit(s.limitType || CONFIG.DEFAULT_LIMIT.type, s.limitValue || CONFIG.DEFAULT_LIMIT.value);
            if (this.elements.limitTypeSelect) this.elements.limitTypeSelect.value = this.inputLimiter.limitType;
            if (this.elements.limitValueInput) this.elements.limitValueInput.value = this.inputLimiter.limitValue;
          } catch (e) {
            console.warn('Failed to apply synced settings:', e);
          }
        }
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
    
    // 入力設定の UI 値を現在の limiter 状態で上書き（クリア後などの同期用）
    if (this.elements.limitTypeSelect) this.elements.limitTypeSelect.value = this.inputLimiter.limitType;
    if (this.elements.limitValueInput) this.elements.limitValueInput.value = this.inputLimiter.limitValue;

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
