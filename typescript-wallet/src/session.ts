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

    // Governance operation checks — DEFAULT-DENY (audit Z2). Governance authority
    // is opt-in: a session must be created with allowIntentSubmit === true (or
    // allowApproval === true) to perform that operation. An omitted flag denies,
    // so a scope that never granted governance authority can never exercise it.
    if (operation === 'intent.submit') {
      if (sk.scope.allowIntentSubmit !== true) {
        throw new Error('Session key not authorized for intent submission');
      }
      const params = typeof functionNameOrParams === 'object' ? functionNameOrParams : undefined;
      // Field-level constraints are enforced when the matching param is present.
      enforceAllowedValue(sk.scope.allowedGoalTypes, params?.goalType, 'goal type');
      enforceAllowedValue(sk.scope.allowedObjectTypes, params?.objectType, 'object type');
      enforceAllowedValue(sk.scope.allowedCapabilities, params?.capability, 'capability');
      enforceAllowedValue(sk.scope.allowedRoles, params?.role, 'role');
      enforceGasBudget(sk.scope.maxGasPerIntent, params);
      return;
    }

    if (operation === 'approval.submit') {
      if (sk.scope.allowApproval !== true) {
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

/**
 * Enforce a whitelist constraint when the corresponding param is present. If the
 * scope constrains a field to a non-empty allow-list and the operation supplies a
 * value for it, that value must be in the list; otherwise the operation is denied.
 * An absent param cannot be validated and is left to other checks.
 */
function enforceAllowedValue(allowed: string[] | undefined, value: unknown, label: string): void {
  if (allowed && allowed.length > 0 && typeof value === 'string') {
    if (!allowed.includes(value)) {
      throw new Error(`Session key not authorized for ${label}: ${value}`);
    }
  }
}

/**
 * Enforce the per-intent gas budget when the scope sets one and the operation
 * supplies a gas figure (as `gas` or `gasLimit`).
 */
function enforceGasBudget(maxGasPerIntent: number | undefined, params?: Record<string, unknown>): void {
  if (typeof maxGasPerIntent !== 'number' || maxGasPerIntent <= 0 || !params) return;
  const raw = params.gas ?? params.gasLimit;
  if (typeof raw === 'number' && raw > maxGasPerIntent) {
    throw new Error(`Session key gas ${raw} exceeds per-intent budget ${maxGasPerIntent}`);
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
    // Governance permissions are preserved VERBATIM (audit Z2): dropping them here
    // is what made governance operations fail open — an omitted allowIntentSubmit
    // became undefined, and the `=== false` check below then let it through. These
    // fields are now carried unchanged and enforced default-deny at validate time.
    allowIntentSubmit: scope.allowIntentSubmit,
    allowApproval: scope.allowApproval,
    allowedGoalTypes: scope.allowedGoalTypes,
    maxGasPerIntent: scope.maxGasPerIntent,
    allowedObjectTypes: scope.allowedObjectTypes,
    allowedCapabilities: scope.allowedCapabilities,
    allowedRoles: scope.allowedRoles,
  };
}
