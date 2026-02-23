// models/Memo.js - メモ本文を表現するドメインオブジェクト

/**
 * Memo - メモ本体のドメインオブジェクト
 * 責務:
 * - メモ本文の保持
 * - 更新時刻の管理
 */
export class Memo {
  /**
   * @param {string} content - メモ本文
   * @param {string} updatedAt - 更新時刻（ISO8601形式）
   */
  constructor(content = '', updatedAt = null) {
    this.content = content;
    this.updatedAt = updatedAt || new Date().toISOString();
  }

  /**
   * メモを更新
   * @param {string} newContent - 新しいメモ本文
   */
  update(newContent) {
    this.content = newContent;
    this.updatedAt = new Date().toISOString();
  }

  /**
   * JSONシリアライズ用
   * @returns {Object}
   */
  toJSON() {
    return {
      content: this.content,
      updatedAt: this.updatedAt
    };
  }

  /**
   * JSONからMemoオブジェクトを復元
   * @param {Object} json
   * @returns {Memo}
   */
  static fromJSON(json) {
    return new Memo(json.content, json.updatedAt);
  }

  /**
   * メモのクローン作成
   * @returns {Memo}
   */
  clone() {
    return new Memo(this.content, this.updatedAt);
  }
}
