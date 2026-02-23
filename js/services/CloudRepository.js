// services/CloudRepository.js - クラウド保存の抽象化レイヤ

/**
 * CloudRepository - クラウド保存の抽象化レイヤ
 * 責務:
 * - read() インターフェース定義
 * - write() インターフェース定義
 * 
 * このクラスは実装を持たず、インターフェースのみを定義
 * 実装は GistRepository や DriveRepository が行う
 */
export class CloudRepository {
  /**
   * クラウドからデータを読み込み
   * @returns {Promise<Object|null>} - データ構造全体、または null
   * @throws {Error} - 通信エラー時
   */
  async read() {
    throw new Error('CloudRepository.read() must be implemented');
  }

  /**
   * クラウドへデータを書き込み
   * @param {Object} data - 完全なデータ構造（meta, memo, sync）
   * @returns {Promise<void>}
   * @throws {Error} - 通信エラー時
   */
  async write(data) {
    throw new Error('CloudRepository.write() must be implemented');
  }

  /**
   * クラウドにデータが存在するか確認
   * @returns {Promise<boolean>}
   */
  async exists() {
    throw new Error('CloudRepository.exists() must be implemented');
  }

  /**
   * 認証状態を確認
   * @returns {Promise<boolean>}
   */
  async isAuthenticated() {
    throw new Error('CloudRepository.isAuthenticated() must be implemented');
  }
}
