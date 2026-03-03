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

/**
 * Gist／クラウドから取得したペイロードの検証・正規化
 * 期待する構造のみを受け入れ、それ以外は安全なデフォルトにする
 * @param {any} payload
 * @returns {Object|null} サニタイズ済みオブジェクト、期待構造でない場合は null
 */
export function sanitizeCloudPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const out = {};

  // meta (任意だがオブジェクトなら主要項目のみコピー)
  out.meta = {};
  if (payload.meta && typeof payload.meta === 'object') {
    out.meta.schemaVersion = isString(payload.meta.schemaVersion) ? payload.meta.schemaVersion : CONFIG.SCHEMA_VERSION;
    out.meta.appVersion = isString(payload.meta.appVersion) ? payload.meta.appVersion : CONFIG.APP_VERSION;
    out.meta.createdAt = isString(payload.meta.createdAt) ? payload.meta.createdAt : new Date().toISOString();
  } else {
    out.meta.schemaVersion = CONFIG.SCHEMA_VERSION;
    out.meta.appVersion = CONFIG.APP_VERSION;
    out.meta.createdAt = new Date().toISOString();
  }

  // memo (必須に近い) - content は文字列であること
  out.memo = { content: '', updatedAt: new Date().toISOString() };
  if (payload.memo && typeof payload.memo === 'object') {
    if (isString(payload.memo.content)) {
      // content はそのまま格納する（表示時は escapeHtml を使う想定）
      out.memo.content = payload.memo.content;
    } else {
      out.memo.content = '';
    }
    out.memo.updatedAt = isString(payload.memo.updatedAt) ? payload.memo.updatedAt : new Date().toISOString();
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
      if (v > 5000) v = 5000;
      out.settings.limitValue = v;
    }
  }

  // sync (任意) - 最低限の項目を受け入れる
  out.sync = {};
  if (payload.sync && typeof payload.sync === 'object') {
    out.sync.lastSyncedAt = isString(payload.sync.lastSyncedAt) ? payload.sync.lastSyncedAt : null;
    out.sync.lastModifiedBy = isString(payload.sync.lastModifiedBy) ? payload.sync.lastModifiedBy : CONFIG.SYNC.MODIFIED_BY.CLOUD;
    out.sync.revision = typeof payload.sync.revision === 'number' ? payload.sync.revision : 0;
  } else {
    out.sync.lastSyncedAt = null;
    out.sync.lastModifiedBy = CONFIG.SYNC.MODIFIED_BY.CLOUD;
    out.sync.revision = 0;
  }

  return out;
}

export default {
  escapeHtml,
  sanitizeCloudPayload
};
