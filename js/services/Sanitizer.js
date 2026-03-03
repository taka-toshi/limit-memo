// services/Sanitizer.js - 入力/外部データのサニタイズ・検証ユーティリティ
import { CONFIG } from '../config.js';

/** エスケープ: HTML 特殊文字を置換して XSS を防ぐ */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replaceAll(/&/g, '&amp;')
    .replaceAll(/</g, '&lt;')
    .replaceAll(/>/g, '&gt;')
    .replaceAll(/"/g, '&quot;')
    .replaceAll(/'/g, '&#39;')
    .replaceAll(/\//g, '&#x2F;');
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
  s = s.replaceAll(/\u0000/g, '');
  s = s.replaceAll(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 改行を統一
  s = s.replaceAll(/\r\n?/g, '\n');

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

  const isValidTimestamp = (v) => {
    if (!isString(v)) return false;
    const t = Date.parse(v);
    return !Number.isNaN(t);
  };

  const out = {};

  const sanitizeMeta = (m) => {
    const meta = {};
    meta.schemaVersion = (typeof m?.schemaVersion === 'number' && Number.isFinite(m?.schemaVersion)) ? m.schemaVersion : CONFIG.SCHEMA_VERSION;
    meta.appVersion = isString(m?.appVersion) ? sanitizeStringForMemo(m.appVersion, 64) : CONFIG.APP_VERSION;
    meta.createdAt = isValidTimestamp(m?.createdAt) ? m.createdAt : new Date().toISOString();
    return meta;
  };

  const sanitizeMemo = (mm) => {
    const memo = { content: '', updatedAt: new Date().toISOString() };
    if (typeof mm === 'object' && mm !== null) {
      if (isString(mm.content)) {
        if (mm.content?.startsWith(CONFIG.ENCRYPTION_PREFIX)) {
          memo.content = mm.content;
        } else {
          memo.content = sanitizeStringForMemo(mm.content, CONFIG.DEFAULT_LIMIT.value);
        }
      }
      memo.updatedAt = isValidTimestamp(mm.updatedAt) ? mm.updatedAt : new Date().toISOString();
    }
    return memo;
  };

  const sanitizeSettings = (s) => {
    const settings = { limitType: CONFIG.DEFAULT_LIMIT.type, limitValue: CONFIG.DEFAULT_LIMIT.value };
    if (typeof s === 'object' && s !== null) {
      const lt = s.limitType;
      const lv = s.limitValue;
      if (isString(lt) && (lt === CONFIG.LIMIT_TYPE.CHAR || lt === CONFIG.LIMIT_TYPE.BYTE)) {
        settings.limitType = lt;
      }
      if (typeof lv === 'number' && !Number.isNaN(lv)) {
        let v = Math.floor(lv);
        if (v < 1) v = 1;
        if (v > CONFIG.MAX_LIMIT_VALUE) v = CONFIG.MAX_LIMIT_VALUE;
        settings.limitValue = v;
      }
    }
    return settings;
  };

  const sanitizeSync = (sync) => {
    const outSync = { lastSyncedAt: null, lastModifiedBy: CONFIG.SYNC.MODIFIED_BY.CLOUD, revision: 0 };
    if (typeof sync === 'object' && sync !== null) {
      outSync.lastSyncedAt = isValidTimestamp(sync.lastSyncedAt) ? sync.lastSyncedAt : null;
      const lm = sync.lastModifiedBy;
      outSync.lastModifiedBy = (isString(lm) && (lm === CONFIG.SYNC.MODIFIED_BY.LOCAL || lm === CONFIG.SYNC.MODIFIED_BY.CLOUD)) ? lm : CONFIG.SYNC.MODIFIED_BY.CLOUD;
      outSync.revision = (typeof sync.revision === 'number' && Number.isFinite(sync.revision) && sync.revision >= 0) ? Math.floor(sync.revision) : 0;
    }
    return outSync;
  };

  out.meta = sanitizeMeta(payload.meta);
  out.memo = sanitizeMemo(payload.memo);
  out.settings = sanitizeSettings(payload.settings);
  out.sync = sanitizeSync(payload.sync);

  return out;
}

export default {
  escapeHtml,
  sanitizeCloudPayload,
  sanitizeStringForMemo,
  isString
};
