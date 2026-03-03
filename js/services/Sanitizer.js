// services/Sanitizer.js - 入力/外部データのサニタイズ・検証ユーティリティ
import { CONFIG } from '../config.js';

/** エスケープ: HTML 特殊文字を置換して XSS を防ぐ */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/** 簡易判定: 値が文字列か */
export function isString(v) {
  return typeof v === 'string';
}

/** メモや外部テキスト向けの正規化・サニタイズ
 * - NULL・制御文字を削除（\n,\t は許容）
 * - 改行を統一
 * - Unicode 正規化 (NFC)
 * - 長さ上限を適用（デフォルトは CONFIG.MAX_LIMIT_VALUE の文字数）
 */
export function sanitizeStringForMemo(value, maxLen = CONFIG.MAX_LIMIT_VALUE) {
  if (!isString(value)) return '';

  // Unicode 正規化
  let s = value.normalize ? value.normalize('NFC') : String(value);

  // NULL と制御文字（タブと改行は許可）を除去
  s = s.replace(/\u0000/g, '');
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 改行を統一
  s = s.replace(/\r\n?/g, '\n');

  // 余分な先頭/末尾空白を除去（ただし内部の空白は維持）
  s = s.trim();

  // 長さ制限（文字数ベース）
  const limit = Number.isInteger(maxLen) && maxLen > 0 ? maxLen : CONFIG.MAX_LIMIT_VALUE;
  if (s.length > limit) {
    s = s.slice(0, limit);
  }

  return s;
}

/**
 * Gist／クラウドから取得したペイロードの検証・正規化
 * 期待する構造のみを受け入れ、それ以外は安全なデフォルトにする
 * @param {any} payload
 * @returns {Object|null} サニタイズ済みオブジェクト、期待構造でない場合は null
 */
export function sanitizeCloudPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const out = {};

  const isValidTimestamp = (v) => {
    if (!isString(v)) return false;
    const t = Date.parse(v);
    return !Number.isNaN(t);
  };

  // meta (任意だがオブジェクトなら主要項目のみコピー)
  out.meta = {};
  if (payload.meta && typeof payload.meta === 'object') {
    // schemaVersion は数値であることを期待
    out.meta.schemaVersion = (typeof payload.meta.schemaVersion === 'number' && Number.isFinite(payload.meta.schemaVersion)) ? payload.meta.schemaVersion : CONFIG.SCHEMA_VERSION;
    out.meta.appVersion = isString(payload.meta.appVersion) ? sanitizeStringForMemo(payload.meta.appVersion, 64) : CONFIG.APP_VERSION;
    out.meta.createdAt = isValidTimestamp(payload.meta.createdAt) ? payload.meta.createdAt : new Date().toISOString();
  } else {
    out.meta.schemaVersion = CONFIG.SCHEMA_VERSION;
    out.meta.appVersion = CONFIG.APP_VERSION;
    out.meta.createdAt = new Date().toISOString();
  }

  // memo (必須に近い) - content は文字列であること
  out.memo = { content: '', updatedAt: new Date().toISOString() };
  if (payload.memo && typeof payload.memo === 'object') {
    if (isString(payload.memo.content)) {
      // 暗号化済みのシリアライズ文字列はそのまま受け入れる（切り詰め等で破壊しない）
      if (payload.memo.content.startsWith && payload.memo.content.startsWith(CONFIG.ENCRYPTION_PREFIX)) {
        out.memo.content = payload.memo.content;
      } else {
        // content は受け取って正規化する（制御文字や長さ制限を適用）
        out.memo.content = sanitizeStringForMemo(payload.memo.content, CONFIG.DEFAULT_LIMIT.value);
      }
    } else {
      out.memo.content = '';
    }
    out.memo.updatedAt = isValidTimestamp(payload.memo.updatedAt) ? payload.memo.updatedAt : new Date().toISOString();
  }

  // settings (任意) - 入力制限に関係する項目のみ検証
  out.settings = {
    limitType: CONFIG.DEFAULT_LIMIT.type,
    limitValue: CONFIG.DEFAULT_LIMIT.value
  };

  if (payload.settings && typeof payload.settings === 'object') {
    const lt = payload.settings.limitType;
    const lv = payload.settings.limitValue;
    if (isString(lt) && (lt === CONFIG.LIMIT_TYPE.CHAR || lt === CONFIG.LIMIT_TYPE.BYTE)) {
      out.settings.limitType = lt;
    }
    if (typeof lv === 'number' && !Number.isNaN(lv)) {
      let v = Math.floor(lv);
      if (v < 1) v = 1;
      if (v > CONFIG.MAX_LIMIT_VALUE) v = CONFIG.MAX_LIMIT_VALUE;
      out.settings.limitValue = v;
    }
  }

  // sync (任意) - 最低限の項目を受け入れる
  out.sync = {};
  if (payload.sync && typeof payload.sync === 'object') {
    out.sync.lastSyncedAt = isValidTimestamp(payload.sync.lastSyncedAt) ? payload.sync.lastSyncedAt : null;
    const lm = payload.sync.lastModifiedBy;
    out.sync.lastModifiedBy = (isString(lm) && (lm === CONFIG.SYNC.MODIFIED_BY.LOCAL || lm === CONFIG.SYNC.MODIFIED_BY.CLOUD)) ? lm : CONFIG.SYNC.MODIFIED_BY.CLOUD;
    out.sync.revision = (typeof payload.sync.revision === 'number' && Number.isFinite(payload.sync.revision) && payload.sync.revision >= 0) ? Math.floor(payload.sync.revision) : 0;
  } else {
    out.sync.lastSyncedAt = null;
    out.sync.lastModifiedBy = CONFIG.SYNC.MODIFIED_BY.CLOUD;
    out.sync.revision = 0;
  }

  return out;
}

export default {
  escapeHtml,
  sanitizeCloudPayload,
  sanitizeStringForMemo,
  isString
};
