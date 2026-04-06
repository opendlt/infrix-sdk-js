/**
 * Session key management for the Infrix wallet.
 *
 * Session keys are scoped, temporary delegations of signing authority.
 * A game can request a session key limited to specific contracts and
 * functions, with an expiry time and usage limit — eliminating per-action
 * signature popups.
 */

import { toHex } from './crypto';
import type { KeyStore, KeyInfo } from './keystore';

/** Constraints on what a session key is permitted to do. */
export interface SessionScope {
  /** Contract URLs the session can interact with (empty = all). */
  contracts?: string[];
  /** Function names the session can call (empty = all). */
  functions?: string[];
  /** Maximum value per transaction (0 = no value transfer). */
  maxValue?: number;
  /** When the session expires (ISO 8601 string or Date). */
  expiresAt?: Date | string;
  /** Maximum number of operations (0 = unlimited). */
  maxUses?: number;

  // Governance permissions

  /** Allow intent submission via this session key. */
  allowIntentSubmit?: boolean;
  /** Allow approval signing via this session key. */
  allowApproval?: boolean;
  /** Intent goal types this session can submit. */
  allowedGoalTypes?: string[];
  /** Maximum gas budget per intent submitted via this session. */
  maxGasPerIntent?: number;
  /** Object types this session can create/transition. */
  allowedObjectTypes?: string[];
  /** Capabilities this session can exercise. */
  allowedCapabilities?: string[];
  /** Roles this session can act under. */
  allowedRoles?: string[];
}

/** A session key with its scope and remaining usage. */
export interface SessionKey {
  publicKey: Uint8Array;
  grantedBy: string;
  scope: SessionScope;
  createdAt: Date;
  usesLeft: number; // -1 = unlimited
}

/** Manages session keys for a wallet. */
export class SessionManager {
  private sessions = new Map<string, SessionKey>();
  private keyStore: KeyStore;
  private adi: string;

  constructor(adi: string, keyStore: KeyStore) {
    this.adi = adi;
    this.keyStore = keyStore;
  }

  /** Create a new session key with scoped permissions. */
  async createSession(scope: SessionScope): Promise<SessionKey> {
    const keyInfo = await this.keyStore.generateKey('ed25519');

    const sk: SessionKey = {
      publicKey: keyInfo.publicKey,
      grantedBy: this.adi,
      scope: normalizeScope(scope),
      createdAt: new Date(),
      usesLeft: scope.maxUses && scope.maxUses > 0 ? scope.maxUses : -1,
    };

    this.sessions.set(toHex(keyInfo.publicKey), sk);
    return sk;
  }

  /** Revoke a session key. */
  async revokeSession(publicKey: Uint8Array): Promise<void> {
    const id = toHex(publicKey);
    if (!this.sessions.has(id)) {
      throw new Error(`Session key not found: ${id.slice(0, 16)}...`);
    }
    this.sessions.delete(id);
    await this.keyStore.deleteKey(publicKey);
  }

  /** List all active session keys. */
  listSessions(): SessionKey[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Validate whether a session key is permitted to perform the given operation.
   * Throws an error describing the violation if not allowed.
   *
   * For contract operations, pass contractUrl and functionName.
   * For governance operations, pass the RPC method as operation with optional params.
   */
  validate(
    publicKey: Uint8Array,
    operation: string,
    functionNameOrParams?: string | Record<string, unknown>
  ): void {
    const sk = this.sessions.get(toHex(publicKey));
    if (!sk) throw new Error('Session key not found');

    // Check expiry.
    if (sk.scope.expiresAt) {
      const expiresAt = sk.scope.expiresAt instanceof Date
        ? sk.scope.expiresAt
        : new Date(sk.scope.expiresAt as string);
      if (new Date() > expiresAt) {
        throw new Error(`Session key expired at ${expiresAt.toISOString()}`);
      }
    }

    // Check remaining uses.
    if (sk.usesLeft === 0) {
      throw new Error('Session key has no remaining uses');
    }

    // Governance operation checks
    if (operation === 'intent.submit') {
      if (sk.scope.allowIntentSubmit === false) {
        throw new Error('Session key not authorized for intent submission');
      }
      const params = typeof functionNameOrParams === 'object' ? functionNameOrParams : undefined;
      if (sk.scope.allowedGoalTypes?.length && params?.goalType) {
        if (!sk.scope.allowedGoalTypes.includes(params.goalType as string)) {
          throw new Error(`Session key not authorized for goal type: ${params.goalType}`);
        }
      }
      return;
    }

    if (operation === 'approval.submit') {
      if (sk.scope.allowApproval === false) {
        throw new Error('Session key not authorized for approvals');
      }
      return;
    }

    // Contract operation checks (legacy signature: operation=contractUrl, functionNameOrParams=fnName)
    const contractUrl = operation;
    const functionName = typeof functionNameOrParams === 'string' ? functionNameOrParams : '';

    // Check contract whitelist.
    if (sk.scope.contracts && sk.scope.contracts.length > 0) {
      if (!sk.scope.contracts.includes(contractUrl)) {
        throw new Error(`Session key not authorized for contract ${contractUrl}`);
      }
    }

    // Check function whitelist.
    if (sk.scope.functions && sk.scope.functions.length > 0) {
      if (!sk.scope.functions.includes(functionName)) {
        throw new Error(`Session key not authorized for function ${functionName}`);
      }
    }
  }

  /** Decrement usage counter after a successful operation. */
  use(publicKey: Uint8Array): void {
    const sk = this.sessions.get(toHex(publicKey));
    if (sk && sk.usesLeft > 0) {
      sk.usesLeft--;
    }
  }
}

function normalizeScope(scope: SessionScope): SessionScope {
  return {
    contracts: scope.contracts || [],
    functions: scope.functions || [],
    maxValue: scope.maxValue || 0,
    expiresAt: scope.expiresAt instanceof Date
      ? scope.expiresAt
      : scope.expiresAt
        ? new Date(scope.expiresAt)
        : undefined,
    maxUses: scope.maxUses || 0,
  };
}
