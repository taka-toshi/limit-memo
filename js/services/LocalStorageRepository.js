// services/LocalStorageRepository.js - 端末内保存を担当

import { CONFIG } from '../config.js';
import { Memo } from '../models/Memo.js';

/**
 * LocalStorageRepository - 端末内保存を担当
 * 責務:
 * - Memoの保存
 * - Memoの読み込み
 * - オフライン時の唯一の永続層
 */
export class LocalStorageRepository {
  constructor() {
    this.storageKey = CONFIG.STORAGE_KEY;
  }

  /**
   * データ全体を保存
   * @param {Object} data - 完全なデータ構造（meta, memo, sync）
   */
  save(data) {
    try {
      // settings があれば別キーにも保存して互換性を保つ
      if (data.settings) {
        try {
          localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(data.settings));
        } catch (e) {
          console.warn('Failed to persist settings separately:', e);
        }
      }

      const jsonString = JSON.stringify(data);
      localStorage.setItem(this.storageKey, jsonString);
    } catch (error) {
      console.error('LocalStorage save failed:', error);
      throw new Error('ローカル保存に失敗しました');
    }
  }

  /**
   * データ全体を読み込み
   * @returns {Object|null} - データ構造全体、または null
   */
  load() {
    try {
      const jsonString = localStorage.getItem(this.storageKey);
      if (!jsonString) {
        return null;
      }
      const data = JSON.parse(jsonString);
      // 互換性: settings が存在しない場合は別キーから読み込む
      if (!data.settings) {
        try {
          const storedSettings = localStorage.getItem(CONFIG.SETTINGS_KEY);
          if (storedSettings) {
            data.settings = JSON.parse(storedSettings);
          } else {
            data.settings = {
              limitType: CONFIG.DEFAULT_LIMIT.type,
              limitValue: CONFIG.DEFAULT_LIMIT.value
            };
          }
        } catch (e) {
          data.settings = {
            limitType: CONFIG.DEFAULT_LIMIT.type,
            limitValue: CONFIG.DEFAULT_LIMIT.value
          };
        }
      }
      return data;
    } catch (error) {
      console.error('LocalStorage load failed:', error);
      return null;
    }
  }

  /**
   * Memoのみを保存（既存データ構造を維持）
   * @param {Memo} memo - 保存するMemo
   */
  saveMemo(memo) {
    const existingData = this.load() || this._createInitialData();
    existingData.memo = memo.toJSON();
    existingData.memo.updatedAt = new Date().toISOString();
    
    // sync情報を更新
    existingData.sync.lastModifiedBy = CONFIG.SYNC.MODIFIED_BY.LOCAL;
    existingData.sync.revision += 1;
    
    this.save(existingData);
  }

  /**
   * Memoのみを読み込み
   * @returns {Memo|null}
   */
  loadMemo() {
    const data = this.load();
    if (!data || !data.memo) {
      return null;
    }
    return Memo.fromJSON(data.memo);
  }

  /**
   * データが存在するか確認
   * @returns {boolean}
   */
  exists() {
    return localStorage.getItem(this.storageKey) !== null;
  }

  /**
   * データを削除
   */
  clear() {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * 初期データ構造を作成
   * @private
   * @returns {Object}
   */
  _createInitialData() {
    return {
      meta: {
        schemaVersion: CONFIG.SCHEMA_VERSION,
        appVersion: CONFIG.APP_VERSION,
        createdAt: new Date().toISOString()
      },
      memo: {
        content: '',
        updatedAt: new Date().toISOString()
      },
      // 入力制限設定をデフォルトで保持
      settings: {
        limitType: CONFIG.DEFAULT_LIMIT.type,
        limitValue: CONFIG.DEFAULT_LIMIT.value
      },
      sync: {
        lastSyncedAt: null,
        lastModifiedBy: CONFIG.SYNC.MODIFIED_BY.LOCAL,
        revision: 0
      }
    };
  }

  /**
   * 完全なデータ構造を初期化して保存
   */
  initialize() {
    const initialData = this._createInitialData();
    this.save(initialData);
    try {
      localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(initialData.settings));
    } catch (e) {
      // ignore
    }
    return initialData;
  }
}
