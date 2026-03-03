// controllers/AppController.js - UI と内部ロジックの仲介役

import { CONFIG } from '../config.js';
import { Memo } from '../models/Memo.js';
import { InputLimiter } from '../services/InputLimiter.js';
import { LocalStorageRepository } from '../services/LocalStorageRepository.js';
import { GistRepository } from '../services/GistRepository.js';
import { SyncManager } from '../services/SyncManager.js';
import { AuthManager } from '../services/AuthManager.js';
import { EncryptionService } from '../services/EncryptionService.js';
import { sanitizeStringForMemo } from '../services/Sanitizer.js';

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
    this.encryptionService = new EncryptionService();
    
    // 現在のメモ
    this.currentMemo = null;
    
    // UI要素（initUIで設定）
    this.elements = {};
    
    // 自動同期タイマー
    this.autoSyncTimer = null;

    // 暗号化メモを復号して編集中の場合の一時バッファ（永続化しない）
    this.decryptedDraft = null;
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
          if (s.limitValue < 1) s.limitValue = 1;
          if (s.limitValue > CONFIG.MAX_LIMIT_VALUE) s.limitValue = CONFIG.MAX_LIMIT_VALUE;
          if (s.limitType !== CONFIG.LIMIT_TYPE.CHAR && s.limitType !== CONFIG.LIMIT_TYPE.BYTE) {
            s.limitType = CONFIG.LIMIT_TYPE.DEFAULT_LIMIT.type;
          }
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
      encryptionPasswordInput: document.getElementById('encryptionPassword'),
      encryptMemoBtn: document.getElementById('encryptMemoBtn'),
      decryptMemoBtn: document.getElementById('decryptMemoBtn'),
      encryptionInfo: document.getElementById('encryptionInfo'),
      offlineIndicator: document.getElementById('offlineIndicator'),
      logoutConfirmModal: document.getElementById('logoutConfirmModal'),
      accountDeleteConfirmModal: document.getElementById('accountDeleteConfirmModal'),
      logoutSuccessModal: document.getElementById('logoutSuccessModal')
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
    const modal = this.elements.clearMemoConfirm;
    const openBtn = this.elements.clearMemoBtn;
    const cancelBtn = this.elements.cancelClearMemoBtn;
    const confirmBtn = this.elements.confirmClearMemoBtn;

    // 開く
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (!modal) return;

        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        modal.removeAttribute('inert');

        // モーダル内へフォーカス移動
        confirmBtn?.focus();
      });
    }

    // キャンセル（閉じる）
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (!modal) return;

        // blur any focused element inside modal first
        try { cancelBtn.blur(); } catch (e) {}
        try { confirmBtn.blur(); } catch (e) {}
        // return focus to opener before hiding modal
        try { openBtn?.focus(); } catch (e) {}

        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
      });
    }

    // 削除実行
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.handleClearMemo();

        if (!modal) return;

        // blur focused elements inside modal
        try { confirmBtn.blur(); } catch (e) {}
        try { cancelBtn.blur(); } catch (e) {}
        // return focus to opener before hiding
        try { openBtn?.focus(); } catch (e) {}

        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
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

    if (this.elements.encryptMemoBtn) {
      this.elements.encryptMemoBtn.addEventListener('click', async () => {
        await this.handleEncryptMemo();
      });
    }

    if (this.elements.decryptMemoBtn) {
      this.elements.decryptMemoBtn.addEventListener('click', async () => {
        await this.handleDecryptMemo();
      });
    }

    // パスワード入力で Enter を押したら自動復号を試みる
    if (this.elements.encryptionPasswordInput) {
      this.elements.encryptionPasswordInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          try {
            // まず自動復号を試みる（現在のメモが暗号化されている場合）
            await this.handleDecryptMemo();
          } catch (err) {
            // handleDecryptMemo が内部でエラー処理するためここでは何もしない
          }
        }
      });
    }
  }

  /**
   * メモ入力処理
   * @param {string} value
   */
  handleMemoInput(value) {
    if (this.isCurrentMemoEncrypted() && this.decryptedDraft !== null) {
      if (this.inputLimiter.isExceeded(value)) {
        value = this.inputLimiter.truncate(value);
        this.elements.memoInput.value = value;
      }

      this.decryptedDraft = this.sanitizeBasic(value);
      this.updateUI({ keepEditorValue: true });
      this.updateSyncStatus('暗号化メモ編集中...');
      return;
    }

    // 入力制限チェック
    if (this.inputLimiter.isExceeded(value)) {
      value = this.inputLimiter.truncate(value);
      this.elements.memoInput.value = value;
    }
    value = this.sanitizeBasic(value);
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
   * メモを暗号化して保存
   */
  async handleEncryptMemo() {
    try {
      const password = this.elements.encryptionPasswordInput?.value || '';

      if (!this.encryptionService.isAvailable()) {
        alert('このブラウザでは暗号化機能を利用できません');
        return;
      }

      // ケース分岐:
      // 1) 現在メモが暗号化済み && セッションで復号済み (decryptedDraft !== null)
      //    - password が空なら平文として保存（暗号化解除）
      //    - password が入力されていれば decryptedDraft を新しいパスワードで暗号化（パスワード変更）
      // 2) 現在メモが暗号化済み && セッションで未復号 (decryptedDraft === null)
      //    - 復号していないため平文が得られず、パスワード変更/削除はできない。先に復号するよう促す。
      // 3) 現在メモが未暗号化
      //    - password が空なら何もしない（保存不要）、password があれば現在の平文を暗号化して保存

      const encryptedNow = this.isCurrentMemoEncrypted();

      if (encryptedNow) {
        if (this.decryptedDraft === null) {
          alert('現在のメモは暗号化されています。パスワードを入力して復号してからパスワード変更または暗号解除を行ってください。');
          return;
        }

        // decryptedDraft がある -> 明文がある
        const source = this.decryptedDraft;
        if (!password) {
          // 平文として保存（暗号解除）
          this.currentMemo.update(source);
          this.localRepo.saveMemo(this.currentMemo);
          // セッションの復号バッファはクリア
          this.decryptedDraft = null;
          this.updateUI();
          this.scheduleAutoSync();
          this.updateSyncStatus('暗号解除して平文として保存しました');
          return;
        } else {
          // 新しいパスワードで再暗号化（パスワード変更）
          const encryptedPayload = await this.encryptionService.encrypt(source, password);
          const encryptedContent = this.encryptionService.serialize(encryptedPayload);
          this.currentMemo.update(encryptedContent);
          this.localRepo.saveMemo(this.currentMemo);
          // decryptedDraft は表示用に保持
          this.updateUI();
          this.scheduleAutoSync();
          this.updateSyncStatus('新しいパスワードで暗号化して保存しました');
          return;
        }
      } else {
        // 未暗号化のメモ
        const source = this.currentMemo?.content || '';
        if (!password) {
          alert('暗号化パスワードを入力してください');
          return;
        }
        const encryptedPayload = await this.encryptionService.encrypt(source, password);
        const encryptedContent = this.encryptionService.serialize(encryptedPayload);
        this.currentMemo.update(encryptedContent);
        this.localRepo.saveMemo(this.currentMemo);
        this.decryptedDraft = source;
        this.updateUI();
        this.scheduleAutoSync();
        this.updateSyncStatus('暗号化して保存（表示は平文）');
        return;
      }
    } catch (error) {
      console.error('Encrypt memo failed:', error);
      alert('暗号化に失敗しました: ' + (error.message || error));
      this.updateSyncStatus('暗号化失敗');
    }
  }

  /**
   * 暗号化メモを復号（セッション表示のみ）
   */
  async handleDecryptMemo() {
    try {
      if (!this.isCurrentMemoEncrypted()) {
        this.updateSyncStatus('このメモは未暗号化です');
        return;
      }

      const password = this.elements.encryptionPasswordInput?.value || '';
      if (!password) {
        alert('復号パスワードを入力してください');
        return;
      }

      const payload = this.encryptionService.deserialize(this.currentMemo.content);
      const plainText = await this.encryptionService.decrypt(payload, password);
      this.decryptedDraft = plainText;

      this.updateUI();
      this.updateSyncStatus('復号成功（このセッションのみ）');
    } catch (error) {
      console.error('Decrypt memo failed:', error);
      alert('復号に失敗しました: ' + (error.message || error));
      this.updateSyncStatus('復号失敗');
    }
  }

  /**
   * 手動同期時に、入力済みパスワードで自動復号を試行
   * @returns {Promise<boolean>} 自動復号できた場合 true
   */
  async tryAutoDecryptWithInputPassword() {
    if (!this.isCurrentMemoEncrypted()) {
      return false;
    }

    const password = this.elements.encryptionPasswordInput?.value || '';
    if (!password) {
      return false;
    }

    try {
      const payload = this.encryptionService.deserialize(this.currentMemo.content);
      const plainText = await this.encryptionService.decrypt(payload, password);
      this.decryptedDraft = plainText;
      return true;
    } catch (error) {
      console.warn('Auto decrypt on manual sync failed:', error);
      return false;
    }
  }

  isCurrentMemoEncrypted() {
    return this.encryptionService.isEncryptedContent(this.currentMemo?.content || '');
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
    const modal = this.elements.logoutConfirmModal;
    const opener = this.elements.logoutBtn; // where focus returns when modal closes
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');

    const confirmBtn = modal.querySelector('.confirm-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');

    confirmBtn?.focus();

    const closeModal = () => {
      // ensure no focused descendant remains inside modal
      try { confirmBtn?.blur(); } catch (e) {}
      try { cancelBtn?.blur(); } catch (e) {}
      // move focus back to opener before hiding to avoid aria-hidden on focused ancestor
      try { opener?.focus(); } catch (e) { /* ignore */ }
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', closeModal);
    };

    const onConfirm = async () => {
      try {
        await this.authManager.logout();
        await this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
        this.updateUI();
        this.updateSyncStatus('ログアウト完了');
      } catch (e) {
        console.error('Logout failed:', e);
        this.updateSyncStatus('ログアウト失敗');
      } finally {
        closeModal();
      }

      // Show modal for logout success
      const successModal = this.elements.logoutSuccessModal;
      if (successModal) {
        successModal.style.display = 'flex';
        successModal.setAttribute('aria-hidden', 'false');
        successModal.removeAttribute('inert');
        const successCloseBtn = successModal.querySelector('.close-btn');
        const closeSuccess = () => {
          // ensure focus is removed from close button
          try { successCloseBtn?.blur(); } catch (e) {}
          // return focus to opener when closing success modal
          try { opener?.focus(); } catch (e) { }
          successModal.style.display = 'none';
          successModal.setAttribute('aria-hidden', 'true');
          successModal.setAttribute('inert', '');
          successCloseBtn.removeEventListener('click', closeSuccess);
        };
        successCloseBtn.addEventListener('click', closeSuccess);
        successCloseBtn.focus();
      }
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', closeModal);
  }

  /**
   * 手動同期処理
   */
  async handleManualSync() {
    if (!this.authManager.isAuthenticated()) {
      alert('同期するにはログインが必要です');
      return;
    }else{
      try {
        this.updateSyncStatus('同期中...');
        await this.transitionTo(CONFIG.APP_STATE.SYNCING);
        
        const success = await this.syncManager.syncToCloud();

        if (success) {
          await this.transitionTo(CONFIG.APP_STATE.SYNCED);
          this.updateSyncStatus('同期完了');

          // 直近のクラウドデータは SyncManager に保存しているため、再取得を避ける
          const cloudData = this.syncManager.lastCloudData || await this.cloudRepo.read();
          if (cloudData) {
            this.currentMemo = Memo.fromJSON(cloudData.memo);
            this.decryptedDraft = null;
            // cloud に含まれる settings があれば InputLimiter と UI に反映
            if (cloudData.settings) {
              try {
                const s = cloudData.settings;
                if (s && typeof s.limitType === 'string' && typeof s.limitValue === 'number') {
                  if (s.limitValue < 1) s.limitValue = 1;
                  if (s.limitValue > CONFIG.MAX_LIMIT_VALUE) s.limitValue = CONFIG.MAX_LIMIT_VALUE;
                  if (s.limitType !== CONFIG.LIMIT_TYPE.CHAR && s.limitType !== CONFIG.LIMIT_TYPE.BYTE) s.limitType = CONFIG.DEFAULT_LIMIT.type;
                  this.inputLimiter.setLimit(s.limitType || CONFIG.DEFAULT_LIMIT.type, s.limitValue || CONFIG.DEFAULT_LIMIT.value);
                  // UI要素も更新
                  if (this.elements.limitTypeSelect) this.elements.limitTypeSelect.value = this.inputLimiter.limitType;
                  if (this.elements.limitValueInput) this.elements.limitValueInput.value = this.inputLimiter.limitValue;
                }
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

            const autoDecrypted = await this.tryAutoDecryptWithInputPassword();
            if (this.isCurrentMemoEncrypted()) {
              if (autoDecrypted) {
                this.updateSyncStatus('同期完了（自動復号済み）');
              } else {
                this.updateSyncStatus('同期完了（復号待ち）');
              }
            }

            this.updateUI();
          }
        } else {
          this.updateSyncStatus('同期失敗');
        }
      } catch (error) {
        console.error('Manual sync failed:', error);
        this.updateSyncStatus('同期エラー（詳細はコンソール）');
      }
    }
  }

  /**
   * アカウント削除処理
   */
  async handleAccountDelete() {
    const modal = this.elements.accountDeleteConfirmModal;
    const opener = this.elements.deleteAccountBtn;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.removeAttribute('inert');

    const confirmBtn = modal.querySelector('.confirm-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');

    const closeModal = () => {
      // ensure no focused descendant remains inside modal
      try { confirmBtn?.blur(); } catch (e) {}
      try { cancelBtn?.blur(); } catch (e) {}
      // return focus to opener before hiding
      try { opener?.focus(); } catch (e) { }
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', closeModal);
    };

    const onConfirm = async () => {
      try {
        this.updateSyncStatus('アカウント削除中...');
        await this.authManager.deleteAccount();

        this.localRepo.clear();
        this.localRepo.initialize();

        await this.transitionTo(CONFIG.APP_STATE.LOCAL_ONLY);
        this.updateUI();
        this.updateSyncStatus('アカウント削除完了');
      } catch (error) {
        console.error('Account delete failed:', error);
        this.updateSyncStatus('アカウント削除失敗');
      } finally {
        closeModal();
      }
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', closeModal);
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
      this.decryptedDraft = null;
      if (this.elements.encryptionPasswordInput) {
        this.elements.encryptionPasswordInput.value = '';
      }

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

      this.updateSyncStatus('ローカルデータ削除完了');
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

    if (value > CONFIG.MAX_LIMIT_VALUE){
      console.log(`Limit value over ${CONFIG.MAX_LIMIT_VALUE} is not allowed.`);
    }
    else if (value < 1) {
      console.log('Limit value under 1 is not allowed.');
    }
    
    else if (value > 0) {
      this.inputLimiter.setLimit(type, value);
      
      // 現在の入力が制限を超えている場合は切り詰め
      const currentValue = this.elements.memoInput.value;
      if (this.inputLimiter.isExceeded(currentValue)) {
        const truncated = this.inputLimiter.truncate(currentValue);
        this.elements.memoInput.value = truncated;
        if (this.isCurrentMemoEncrypted() && this.decryptedDraft !== null) {
          this.decryptedDraft = this.sanitizeBasic(truncated);
        } else {
          this.currentMemo.update(truncated);
          this.localRepo.saveMemo(this.currentMemo);
        }
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
        this.decryptedDraft = null;
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
      this.updateSyncStatus('同期エラー（詳細はコンソール）');
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

  sanitizeBasic(value) {
    // 正規化・制御文字除去は Sanitizer 側のロジックを利用する
    // 表示のために HTML エスケープは行わず、入力の正規化のみ行う
    try {
      // バイト制限の場合は truncate を使って正確に切り詰める
      if (this.inputLimiter && this.inputLimiter.limitType === CONFIG.LIMIT_TYPE.BYTE) {
        // まず文字列正規化（長さ上限は大きめにしておく）
        let s = sanitizeStringForMemo(String(value), CONFIG.MAX_LIMIT_VALUE);
        if (this.inputLimiter.isExceeded(s)) {
          s = this.inputLimiter.truncate(s);
        }
        return s;
      }

      // 文字数制限（CHAR）の場合は inputLimiter の limitValue を反映して切り詰める
      const max = (this.inputLimiter && Number.isInteger(this.inputLimiter.limitValue)) ? this.inputLimiter.limitValue : CONFIG.DEFAULT_LIMIT.value;
      return sanitizeStringForMemo(String(value), max);
    } catch (e) {
      return console.error('Failed to sanitize value:', e);
    }
  }

  /**
   * UI更新
   */
  updateUI(options = {}) {
    const encrypted = this.isCurrentMemoEncrypted();

    // メモ表示（暗号化時は平文を描画しない）
    if (encrypted) {
      if (this.decryptedDraft !== null) {
        if (!options.keepEditorValue) {
          this.elements.memoInput.value = this.decryptedDraft;
        }
        this.elements.memoInput.disabled = false;
        this.elements.memoInput.placeholder = '復号済み。編集後は「暗号化保存」を押してください';
      } else {
        this.elements.memoInput.value = '';
        this.elements.memoInput.disabled = true;
        this.elements.memoInput.placeholder = 'このメモは暗号化されています。パスワードを入力して復号してください。\nパスワードが未入力、または正しくない可能性があります。';
      }
    } else {
      if (this.currentMemo && typeof this.currentMemo.content === 'string' && !options.keepEditorValue) {
        this.elements.memoInput.value = this.currentMemo.content;
      }
      this.elements.memoInput.disabled = false;
      this.elements.memoInput.placeholder = 'ここにメモを入力してください...';
      this.decryptedDraft = null;
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

    // 暗号化UI表示
    if (this.elements.encryptMemoBtn) {
      this.elements.encryptMemoBtn.textContent = '暗号化して保存';
    }
    if (this.elements.decryptMemoBtn) {
      this.elements.decryptMemoBtn.disabled = !encrypted;
    }
    if (this.elements.encryptionInfo) {
      if (!this.encryptionService.isAvailable()) {
        this.elements.encryptionInfo.textContent = 'このブラウザでは暗号化機能を利用できません';
      } else if (!encrypted) {
        this.elements.encryptionInfo.textContent = '現在: 平文（暗号化なし）';
      } else if (this.decryptedDraft !== null) {
        this.elements.encryptionInfo.textContent = '現在: 暗号化済み（表示は平文、保存データは暗号化）';
      } else {
        this.elements.encryptionInfo.textContent = '現在: 暗号化済み（パスワードは保存されません）';
      }
    }

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
    this.elements.deleteAccountBtn.style.display = isAuthenticated ? 'inline-block' : 'none';
    
    // オフライン表示
    this.elements.offlineIndicator.style.display = 
      this.appState === CONFIG.APP_STATE.OFFLINE ? 'block' : 'none';
  }

  /**
   * 同期状態表示更新
   * @param {string} message
   */
  updateSyncStatus(message) {
    const statusEl = this.elements.syncStatus;
    if (!statusEl) return;

    const textEl = statusEl.querySelector('.sync-status-text');
    const normalized = (message || '').trim();

    if (!normalized) {
      statusEl.classList.remove('show');
      statusEl.classList.remove('idle');
      statusEl.style.opacity = '0';
      statusEl.style.transform = 'translateX(-50%) translateY(12px)';
      if (textEl) textEl.textContent = '';
      return;
    }

    if (textEl) {
      textEl.textContent = normalized;
    } else {
      statusEl.textContent = normalized;
    }

    const isProgress = /中/.test(normalized);
    statusEl.classList.toggle('idle', !isProgress);
    statusEl.classList.add('show');
    statusEl.style.opacity = '1';
    statusEl.style.transform = 'translateX(-50%) translateY(0)';

    setTimeout(() => {
      const current = (textEl ? textEl.textContent : statusEl.textContent || '').trim();
      if (current === normalized) {
        statusEl.classList.remove('show');
        statusEl.classList.remove('idle');
        statusEl.style.opacity = '0';
        statusEl.style.transform = 'translateX(-50%) translateY(12px)';
        if (textEl) textEl.textContent = '';
        else statusEl.textContent = '';
      }
    }, 5000);
  }

  /**
   * Service Worker登録
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        /*console.log('Service Worker registered:', registration);*/
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
