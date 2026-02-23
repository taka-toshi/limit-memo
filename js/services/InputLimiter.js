// services/InputLimiter.js - 入力制限ロジック専用

import { CONFIG } from '../config.js';

/**
 * InputLimiter - 入力制限ロジック専用
 * 責務:
 * - 現在の文字数 / バイト数計算
 * - 制限超過判定
 */
export class InputLimiter {
  /**
   * @param {string} limitType - CHAR または BYTE
   * @param {number} limitValue - 制限値
   */
  constructor(limitType = CONFIG.DEFAULT_LIMIT.type, limitValue = CONFIG.DEFAULT_LIMIT.value) {
    this.limitType = limitType;
    this.limitValue = limitValue;
  }

  /**
   * 現在の使用量を計算
   * @param {string} text - 対象テキスト
   * @returns {number}
   */
  calculateUsage(text) {
    if (this.limitType === CONFIG.LIMIT_TYPE.CHAR) {
      return text.length;
    } else if (this.limitType === CONFIG.LIMIT_TYPE.BYTE) {
      return new TextEncoder().encode(text).length;
    }
    return 0;
  }

  /**
   * 制限超過判定
   * @param {string} text - 対象テキスト
   * @returns {boolean}
   */
  isExceeded(text) {
    return this.calculateUsage(text) > this.limitValue;
  }

  /**
   * 残量計算
   * @param {string} text - 対象テキスト
   * @returns {number}
   */
  getRemainder(text) {
    return this.limitValue - this.calculateUsage(text);
  }

  /**
   * 使用率計算（0.0 ~ 1.0）
   * @param {string} text - 対象テキスト
   * @returns {number}
   */
  getUsageRate(text) {
    return this.calculateUsage(text) / this.limitValue;
  }

  /**
   * 制限値を変更
   * @param {string} type - CHAR または BYTE
   * @param {number} value - 制限値
   */
  setLimit(type, value) {
    this.limitType = type;
    this.limitValue = value;
  }

  /**
   * 入力可能な最大テキストに切り詰め
   * @param {string} text - 対象テキスト
   * @returns {string}
   */
  truncate(text) {
    if (!this.isExceeded(text)) {
      return text;
    }

    if (this.limitType === CONFIG.LIMIT_TYPE.CHAR) {
      return text.substring(0, this.limitValue);
    } else if (this.limitType === CONFIG.LIMIT_TYPE.BYTE) {
      // バイト単位での切り詰め
      const encoder = new TextEncoder();
      let truncated = text;
      while (encoder.encode(truncated).length > this.limitValue && truncated.length > 0) {
        truncated = truncated.substring(0, truncated.length - 1);
      }
      return truncated;
    }
    return text;
  }
}
