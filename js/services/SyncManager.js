// services/SyncManager.js - 同期制御の中核

import { CONFIG } from '../config.js';

/**
 * SyncManager - 同期制御の中核
 * 責務:
 * - 同期タイミング判断
 * - ローカル vs クラウドの比較
 * - 衝突時の解決（後勝ち）
 */
export class SyncManager {
  /**
   * @param {LocalStorageRepository} localRepo
   * @param {CloudRepository} cloudRepo
   */
  constructor(localRepo, cloudRepo) {
    this.localRepo = localRepo;
    this.cloudRepo = cloudRepo;
    this.syncState = 'idle'; // idle / syncing / synced / error
    this.lastSyncedAt = null;
  }

  /**
   * 初回同期（起動時）
   * ローカルとクラウドを比較して適切な方を採用
   * @returns {Promise<Object>} - 同期後のデータ
   */
  async initialSync() {
    this.syncState = 'syncing';

    try {
      // 認証チェック
      if (!await this.cloudRepo.isAuthenticated()) {
        this.syncState = 'idle';
        return this.localRepo.load();
      }

      const localData = this.localRepo.load();
      let cloudData = null;

      try {
        cloudData = await this.cloudRepo.read();
      } catch (error) {
        console.error('Cloud read failed:', error);
        // クラウド読み込み失敗時はローカルを使用
        this.syncState = 'error';
        return localData;
      }

      // 両方nullの場合は初期化
      if (!localData && !cloudData) {
        const initialData = this.localRepo.initialize();
        await this.cloudRepo.write(initialData);
        this.syncState = 'synced';
        this.lastSyncedAt = new Date().toISOString();
        return initialData;
      }

      // ローカルのみ存在
      if (localData && !cloudData) {
        await this.cloudRepo.write(localData);
        localData.sync.lastSyncedAt = new Date().toISOString();
        this.localRepo.save(localData);
        this.syncState = 'synced';
        this.lastSyncedAt = localData.sync.lastSyncedAt;
        return localData;
      }

      // クラウドのみ存在
      if (!localData && cloudData) {
        this.localRepo.save(cloudData);
        this.syncState = 'synced';
        this.lastSyncedAt = cloudData.sync.lastSyncedAt;
        return cloudData;
      }

      // 両方存在 → 比較して新しい方を採用
      const resolvedData = this._resolveConflict(localData, cloudData);
      
      if (resolvedData === localData) {
        // ローカルが新しい → クラウドへ書き込み
        await this.cloudRepo.write(resolvedData);
        resolvedData.sync.lastSyncedAt = new Date().toISOString();
        this.localRepo.save(resolvedData);
      } else {
        // クラウドが新しい → ローカルへ書き込み
        this.localRepo.save(resolvedData);
      }

      this.syncState = 'synced';
      this.lastSyncedAt = resolvedData.sync.lastSyncedAt;
      return resolvedData;

    } catch (error) {
      console.error('Initial sync failed:', error);
      this.syncState = 'error';
      // エラー時はローカルを返す
      return this.localRepo.load();
    }
  }

  /**
   * ローカルの変更をクラウドに同期
   * @returns {Promise<boolean>} - 同期成功時 true
   */
  async syncToCloud() {
    this.syncState = 'syncing';

    try {
      if (!await this.cloudRepo.isAuthenticated()) {
        this.syncState = 'idle';
        return false;
      }

      const localData = this.localRepo.load();
      if (!localData) {
        this.syncState = 'idle';
        return false;
      }

      // クラウドの最新状態を確認
      let cloudData = null;
      try {
        cloudData = await this.cloudRepo.read();
      } catch (error) {
        console.error('Cloud read failed during sync:', error);
      }

      // 衝突チェック
      if (cloudData) {
        const resolved = this._resolveConflict(localData, cloudData);
        if (resolved !== localData) {
          // クラウドの方が新しい → ローカルを更新
          this.localRepo.save(resolved);
          this.syncState = 'synced';
          this.lastSyncedAt = resolved.sync.lastSyncedAt;
          return true;
        }
      }

      // ローカルをクラウドに書き込み
      await this.cloudRepo.write(localData);
      
      // 同期時刻を更新
      localData.sync.lastSyncedAt = new Date().toISOString();
      this.localRepo.save(localData);

      this.syncState = 'synced';
      this.lastSyncedAt = localData.sync.lastSyncedAt;
      return true;

    } catch (error) {
      console.error('Sync to cloud failed:', error);
      this.syncState = 'error';
      return false;
    }
  }

  /**
   * クラウドの変更をローカルに同期
   * @returns {Promise<boolean>} - 同期成功時 true
   */
  async syncFromCloud() {
    this.syncState = 'syncing';

    try {
      if (!await this.cloudRepo.isAuthenticated()) {
        this.syncState = 'idle';
        return false;
      }

      const cloudData = await this.cloudRepo.read();
      if (!cloudData) {
        this.syncState = 'idle';
        return false;
      }

      const localData = this.localRepo.load();
      
      // 衝突チェック
      if (localData) {
        const resolved = this._resolveConflict(localData, cloudData);
        this.localRepo.save(resolved);
      } else {
        this.localRepo.save(cloudData);
      }

      this.syncState = 'synced';
      this.lastSyncedAt = cloudData.sync.lastSyncedAt;
      return true;

    } catch (error) {
      console.error('Sync from cloud failed:', error);
      this.syncState = 'error';
      return false;
    }
  }

  /**
   * 衝突解決（後勝ち）
   * @private
   * @param {Object} localData
   * @param {Object} cloudData
   * @returns {Object} - 採用するデータ
   */
  _resolveConflict(localData, cloudData) {
    const localRevision = localData.sync.revision || 0;
    const cloudRevision = cloudData.sync.revision || 0;

    // revision が大きい方が新しい
    if (localRevision > cloudRevision) {
      return localData;
    } else if (cloudRevision > localRevision) {
      return cloudData;
    }

    // revision が同じ場合は updatedAt で判定
    const localUpdatedAt = new Date(localData.memo.updatedAt);
    const cloudUpdatedAt = new Date(cloudData.memo.updatedAt);

    if (localUpdatedAt > cloudUpdatedAt) {
      return localData;
    } else {
      return cloudData;
    }
  }

  /**
   * 同期状態を取得
   * @returns {string}
   */
  getSyncState() {
    return this.syncState;
  }

  /**
   * 最終同期時刻を取得
   * @returns {string|null}
   */
  getLastSyncedAt() {
    return this.lastSyncedAt;
  }

  /**
   * 同期が必要か判定
   * @returns {boolean}
   */
  needsSync() {
    const localData = this.localRepo.load();
    if (!localData) {
      return false;
    }

    // lastModifiedBy が local かつ未同期
    return localData.sync.lastModifiedBy === CONFIG.SYNC.MODIFIED_BY.LOCAL &&
           (!localData.sync.lastSyncedAt || 
            new Date(localData.memo.updatedAt) > new Date(localData.sync.lastSyncedAt));
  }
}
