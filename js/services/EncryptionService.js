// services/EncryptionService.js - メモ本文の暗号化/復号を担当

import { CONFIG } from '../config.js';

/**
 * EncryptionService - ブラウザ標準 Web Crypto API を使った暗号化サービス
 */
export class EncryptionService {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  isAvailable() {
    return !!globalThis.crypto?.subtle;
  }

  isEncryptedContent(content) {
    return typeof content === 'string' && content?.startsWith(CONFIG.ENCRYPTION_PREFIX);
  }

  async encrypt(plainText, password) {
    this._assertAvailable();
    if (typeof plainText !== 'string') {
      throw new TypeError('暗号化対象が不正です');
    }
    this._assertPassword(password);

    const salt = globalThis.crypto.getRandomValues(new Uint8Array(CONFIG.ENCRYPTION.SALT_BYTES));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(CONFIG.ENCRYPTION.IV_BYTES));
    const key = await this._deriveKey(password, salt, CONFIG.ENCRYPTION.KDF_ITERATIONS);

    const encrypted = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      this.encoder.encode(plainText)
    );

    return {
      version: 1,
      kdf: 'PBKDF2',
      hash: 'SHA-256',
      iterations: CONFIG.ENCRYPTION.KDF_ITERATIONS,
      cipher: 'AES-GCM',
      salt: this._bytesToBase64(salt),
      iv: this._bytesToBase64(iv),
      data: this._bytesToBase64(new Uint8Array(encrypted))
    };
  }

  async decrypt(payload, password) {
    this._assertAvailable();
    this._assertPassword(password);
    this._assertPayload(payload);

    const salt = this._base64ToBytes(payload.salt);
    const iv = this._base64ToBytes(payload.iv);
    const data = this._base64ToBytes(payload.data);
    const key = await this._deriveKey(password, salt, payload.iterations);

    try {
      const decrypted = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      return this.decoder.decode(decrypted);
    } catch (error) {
      console.error('Failed to decrypt:', error);
      throw new Error('復号に失敗しました。パスワードを確認してください。');
    }
  }

  serialize(payload) {
    const json = JSON.stringify(payload);
    const bytes = this.encoder.encode(json);
    return `${CONFIG.ENCRYPTION_PREFIX}${this._bytesToBase64(bytes)}`;
  }

  deserialize(content) {
    if (!this.isEncryptedContent(content)) {
      throw new Error('暗号化データではありません');
    }

    const rawBase64 = content.slice(CONFIG.ENCRYPTION_PREFIX.length);
    const json = this.decoder.decode(this._base64ToBytes(rawBase64));
    const payload = JSON.parse(json);
    this._assertPayload(payload);
    return payload;
  }

  async _deriveKey(password, salt, iterations) {
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      this.encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return globalThis.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  _bytesToBase64(bytes) {
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCodePoint(...chunk);
    }
    return btoa(binary);
  }

  _base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.codePointAt(i);
    }
    return bytes;
  }

  _assertAvailable() {
    if (!this.isAvailable()) {
      throw new Error('このブラウザでは暗号化機能を利用できません');
    }
  }

  _assertPassword(password) {
    if (typeof password !== 'string' || password.length === 0) {
      throw new Error('パスワードを入力してください');
    }
  }

  _assertPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('暗号化データ形式が不正です');
    }

    const required = ['version', 'iterations', 'salt', 'iv', 'data'];
    for (const key of required) {
      if (!(key in payload)) {
        throw new Error('暗号化データ形式が不正です');
      }
    }
  }
}
