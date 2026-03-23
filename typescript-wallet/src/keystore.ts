/**
 * Key storage backends for the Infrix wallet.
 *
 * Provides an in-memory store for testing and an encrypted store that uses
 * AES-256-GCM via the Web Crypto API for production use.
 */

import { generateEd25519KeyPair, toHex, fromHex, sha256, Ed25519KeyPair } from './crypto';

/** Metadata about a stored key. */
export interface KeyInfo {
  publicKey: Uint8Array;
  algorithm: string;
  createdAt: Date;
  label: string;
}

/** Key storage interface. */
export interface KeyStore {
  generateKey(algorithm?: string): Promise<KeyInfo>;
  sign(publicKey: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
  listKeys(): Promise<KeyInfo[]>;
  deleteKey(publicKey: Uint8Array): Promise<void>;
  exportKey(publicKey: Uint8Array, password: string): Promise<Uint8Array>;
  importKey(encryptedKey: Uint8Array, password: string): Promise<KeyInfo>;
}

// ---- In-Memory KeyStore ----

interface StoredKey {
  keyPair: Ed25519KeyPair;
  info: KeyInfo;
}

/** In-memory key store for testing and development. */
export class MemoryKeyStore implements KeyStore {
  private keys = new Map<string, StoredKey>();

  async generateKey(algorithm = 'ed25519'): Promise<KeyInfo> {
    if (algorithm !== 'ed25519') {
      throw new Error(`Unsupported algorithm: ${algorithm}`);
    }
    const kp = await generateEd25519KeyPair();
    const info: KeyInfo = {
      publicKey: kp.publicKey,
      algorithm: 'ed25519',
      createdAt: new Date(),
      label: '',
    };
    this.keys.set(toHex(kp.publicKey), { keyPair: kp, info });
    return info;
  }

  async sign(publicKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
    const stored = this.keys.get(toHex(publicKey));
    if (!stored) throw new Error('Key not found');
    // Simplified: import and use crypto module's sign.
    const { signEd25519 } = await import('./crypto');
    return signEd25519(stored.keyPair.privateKey, message);
  }

  async listKeys(): Promise<KeyInfo[]> {
    return Array.from(this.keys.values()).map(k => k.info);
  }

  async deleteKey(publicKey: Uint8Array): Promise<void> {
    const id = toHex(publicKey);
    if (!this.keys.has(id)) throw new Error('Key not found');
    this.keys.delete(id);
  }

  async exportKey(publicKey: Uint8Array, password: string): Promise<Uint8Array> {
    const stored = this.keys.get(toHex(publicKey));
    if (!stored) throw new Error('Key not found');
    return encryptWithPassword(stored.keyPair.privateKey, password);
  }

  async importKey(encryptedKey: Uint8Array, password: string): Promise<KeyInfo> {
    const privateKey = await decryptWithPassword(encryptedKey, password);
    if (privateKey.length !== 64) throw new Error('Invalid key size');
    const publicKey = privateKey.slice(32, 64);
    const kp: Ed25519KeyPair = { publicKey, privateKey };
    const info: KeyInfo = {
      publicKey,
      algorithm: 'ed25519',
      createdAt: new Date(),
      label: '',
    };
    this.keys.set(toHex(publicKey), { keyPair: kp, info });
    return info;
  }
}

// ---- Encrypted Key Store Helpers ----

/**
 * Encrypt data with a password using AES-256-GCM.
 * Format: 12-byte nonce || ciphertext || 16-byte auth tag
 */
async function encryptWithPassword(data: Uint8Array, password: string): Promise<Uint8Array> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const keyMaterial = await deriveKeyWeb(password);
    const nonce = new Uint8Array(12);
    globalThis.crypto.getRandomValues(nonce);
    const encrypted = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      keyMaterial,
      data,
    );
    const result = new Uint8Array(12 + encrypted.byteLength);
    result.set(nonce, 0);
    result.set(new Uint8Array(encrypted), 12);
    return result;
  }
  // Node.js fallback.
  return encryptNode(data, password);
}

/**
 * Decrypt data encrypted with encryptWithPassword.
 */
async function decryptWithPassword(encrypted: Uint8Array, password: string): Promise<Uint8Array> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const keyMaterial = await deriveKeyWeb(password);
    const nonce = encrypted.slice(0, 12);
    const ciphertext = encrypted.slice(12);
    const decrypted = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      keyMaterial,
      ciphertext,
    );
    return new Uint8Array(decrypted);
  }
  return decryptNode(encrypted, password);
}

async function deriveKeyWeb(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyData = await sha256(enc.encode('infrix-wallet:' + password));
  return globalThis.crypto.subtle.importKey(
    'raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
}

function encryptNode(data: Uint8Array, password: string): Uint8Array {
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update('infrix-wallet:' + password).digest();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const result = new Uint8Array(12 + encrypted.length + tag.length);
  result.set(new Uint8Array(nonce), 0);
  result.set(new Uint8Array(encrypted), 12);
  result.set(new Uint8Array(tag), 12 + encrypted.length);
  return result;
}

function decryptNode(encrypted: Uint8Array, password: string): Uint8Array {
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update('infrix-wallet:' + password).digest();
  const nonce = encrypted.slice(0, 12);
  const tagStart = encrypted.length - 16;
  const ciphertext = encrypted.slice(12, tagStart);
  const tag = encrypted.slice(tagStart);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce));
  decipher.setAuthTag(Buffer.from(tag));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  return new Uint8Array(decrypted);
}
