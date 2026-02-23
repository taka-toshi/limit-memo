// services/GistRepository.js - GitHub Gist への保存を実装

import { CloudRepository } from './CloudRepository.js';
import { CONFIG } from '../config.js';

/**
 * GistRepository - GitHub Gist への保存を担当
 * CloudRepository を実装
 * 責務:
 * - クラウドからのメモ取得
 * - クラウドへのメモ保存
 */
export class GistRepository extends CloudRepository {
  /**
   * @param {AuthManager} authManager - 認証マネージャー
   */
  constructor(authManager) {
    super();
    this.authManager = authManager;
    this.gistId = null;
    this._loadGistId();
  }

  /**
   * Gist IDをlocalStorageから読み込み
   * @private
   */
  _loadGistId() {
    try {
      const stored = localStorage.getItem('gist_id');
      if (stored) {
        this.gistId = stored;
      }
    } catch (error) {
      console.error('Failed to load gist_id:', error);
    }
  }

  /**
   * Gist IDをlocalStorageに保存
   * @private
   */
  _saveGistId() {
    try {
      if (this.gistId) {
        localStorage.setItem('gist_id', this.gistId);
      }
    } catch (error) {
      console.error('Failed to save gist_id:', error);
    }
  }

  /**
   * 認証状態を確認
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    return this.authManager.isAuthenticated();
  }

  /**
   * クラウドからデータを読み込み
   * @returns {Promise<Object|null>}
   */
  async read() {
    if (!await this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const token = this.authManager.getAccessToken();
    
    // Gist IDが未設定の場合、ユーザーのGist一覧から探す
    if (!this.gistId) {
      await this._findOrCreateGist(token);
    }

    if (!this.gistId) {
      return null;
    }

    try {
      const response = await fetch(`${CONFIG.GIST.API_BASE}/gists/${this.gistId}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.status === 404) {
        // Gistが削除されている場合
        this.gistId = null;
        this._saveGistId();
        return null;
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const gist = await response.json();
      const file = gist.files[CONFIG.GIST.FILENAME];
      
      if (!file) {
        return null;
      }

      return JSON.parse(file.content);
    } catch (error) {
      console.error('Gist read failed:', error);
      throw error;
    }
  }

  /**
   * クラウドへデータを書き込み
   * @param {Object} data - 完全なデータ構造
   * @returns {Promise<void>}
   */
  async write(data) {
    if (!await this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const token = this.authManager.getAccessToken();
    const content = JSON.stringify(data, null, 2);

    // Gist IDが未設定の場合、新規作成
    if (!this.gistId) {
      await this._createGist(token, content);
      return;
    }

    // 既存Gistを更新
    try {
      const response = await fetch(`${CONFIG.GIST.API_BASE}/gists/${this.gistId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            [CONFIG.GIST.FILENAME]: {
              content: content
            }
          }
        })
      });

      if (response.status === 404) {
        // Gistが削除されている場合は新規作成
        this.gistId = null;
        await this._createGist(token, content);
        return;
      }

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
    } catch (error) {
      console.error('Gist write failed:', error);
      throw error;
    }
  }

  /**
   * クラウドにデータが存在するか確認
   * @returns {Promise<boolean>}
   */
  async exists() {
    if (!this.gistId || !await this.isAuthenticated()) {
      return false;
    }

    try {
      const data = await this.read();
      return data !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * ユーザーのGist一覧から対象Gistを探す
   * @private
   * @param {string} token - アクセストークン
   */
  async _findOrCreateGist(token) {
    try {
      const response = await fetch(`${CONFIG.GIST.API_BASE}/gists`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const gists = await response.json();
      
      // memo.json を含むGistを探す
      for (const gist of gists) {
        if (gist.files[CONFIG.GIST.FILENAME]) {
          this.gistId = gist.id;
          this._saveGistId();
          return;
        }
      }

      // 見つからなかった場合はnullのまま（write時に新規作成される）
    } catch (error) {
      console.error('Failed to find gist:', error);
      throw error;
    }
  }

  /**
   * 新規Gistを作成
   * @private
   * @param {string} token - アクセストークン
   * @param {string} content - ファイル内容
   */
  async _createGist(token, content) {
    try {
      const response = await fetch(`${CONFIG.GIST.API_BASE}/gists`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          description: 'Memo App Data',
          public: false,
          files: {
            [CONFIG.GIST.FILENAME]: {
              content: content
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const gist = await response.json();
      this.gistId = gist.id;
      this._saveGistId();
    } catch (error) {
      console.error('Gist creation failed:', error);
      throw error;
    }
  }
}
