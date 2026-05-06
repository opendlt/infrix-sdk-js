/**
 * InfrixWallet — ADI-native smart wallet for the Infrix platform.
 *
 * The wallet's public surface is governance-first: keys, session keys,
 * social recovery, and submission of intents that flow through the
 * canonical spine (Intent -> Plan -> Approval -> Execution -> Outcome ->
 * Evidence -> Anchor). All state-changing actions — including contract
 * deployment and contract calls — are expressed as intents via
 * `submitIntent` with an appropriate goal type (e.g. CONTRACT_DEPLOY,
 * CONTRACT_CALL, OBJECT_CREATE). There is no direct contract surface on
 * the wallet.
 *
 * @example
 * ```typescript
 * import { InfrixWallet } from '@infrix/wallet';
 *
 * const wallet = new InfrixWallet('acc://alice.acme', {
 *   rpcUrl: 'http://localhost:8080/rpc',
 * });
 *
 * await wallet.generateKey();
 * const result = await wallet.submitIntent({
 *   type: 'CONTRACT_CALL',
 *   customParams: {
 *     contractAddress: 'acc://game.acme/counter',
 *     function: 'increment',
 *     arguments: [],
 *   },
 * });
 * ```
 */

import { toHex } from './crypto';
import { MemoryKeyStore, KeyStore, KeyInfo } from './keystore';
import { SessionManager, SessionScope, SessionKey } from './session';
import type {
  IntentGoal,
  IntentResult,
  IntentSubmitOptions,
  ApprovalEnvelope,
  OutcomeRecord,
  EvidenceBundle,
} from './governance-types';

/** Options for creating a wallet. */
export interface WalletOptions {
  /** JSON-RPC endpoint URL. Default: http://localhost:8080/rpc */
  rpcUrl?: string;
  /** Custom key store implementation. Default: MemoryKeyStore */
  keyStore?: KeyStore;
}

/** Social recovery request. */
export interface RecoveryRequest {
  newKey: Uint8Array;
  guardians: string[];
  threshold: number;
  approvals: string[];
  status: string;
}

/** Sponsorship configuration. */
export interface SponsorConfig {
  contracts?: string[];
  callers?: string[];
  maxGasPerTx?: number;
  dailyLimit?: number;
}

export class InfrixWallet {
  /** The wallet's Accumulate Digital Identifier URL. */
  readonly adi: string;

  private rpcUrl: string;
  private keyStore: KeyStore;
  private sessionMgr: SessionManager;
  private activeKey: Uint8Array | null = null;
  private guardians: string[] = [];
  private guardianThreshold = 0;
  private localSponsorConfig: SponsorConfig | null = null;

  constructor(adi: string, options?: WalletOptions) {
    this.adi = adi;
    this.rpcUrl = options?.rpcUrl || 'http://localhost:8080/rpc';
    this.keyStore = options?.keyStore || new MemoryKeyStore();
    this.sessionMgr = new SessionManager(adi, this.keyStore);
  }

  // ---- Account Info ----

  /** Get the wallet's token balance (via explorer.status or L0 query). */
  async balance(): Promise<bigint> {
    if (!this.rpcUrl) {
      console.warn('InfrixWallet: no rpcUrl configured — returning 0 balance');
      return 0n;
    }

    try {
      const result = await this.rpc('account.balance', { url: this.adi });
      const raw = result.balance;
      if (typeof raw === 'string') return BigInt(raw);
      if (typeof raw === 'number') return BigInt(raw);
      if (typeof raw === 'bigint') return raw;
      return 0n;
    } catch {
      // Node unreachable or account not yet on-chain — return zero.
      return 0n;
    }
  }

  /** Get the wallet's credit balance. */
  async credits(): Promise<bigint> {
    return BigInt(0);
  }

  // ---- Key Management ----

  /** Generate a new Ed25519 key pair. The first generated key becomes active. */
  async generateKey(algorithm: 'ed25519' | 'secp256k1' = 'ed25519'): Promise<KeyInfo> {
    const info = await this.keyStore.generateKey(algorithm);
    if (!this.activeKey) {
      this.activeKey = info.publicKey;
    }
    return info;
  }

  /** Import an encrypted key. */
  async importKey(encryptedKey: Uint8Array, password: string): Promise<KeyInfo> {
    const info = await this.keyStore.importKey(encryptedKey, password);
    if (!this.activeKey) {
      this.activeKey = info.publicKey;
    }
    return info;
  }

  /** List all keys in the wallet. */
  async listKeys(): Promise<KeyInfo[]> {
    return this.keyStore.listKeys();
  }

  // ---- Session Keys ----

  /** Create a scoped session key for delegated signing. */
  async createSession(scope: SessionScope): Promise<SessionKey> {
    return this.sessionMgr.createSession(scope);
  }

  /** Revoke a session key. */
  async revokeSession(publicKey: Uint8Array): Promise<void> {
    return this.sessionMgr.revokeSession(publicKey);
  }

  /** List all active session keys. */
  listSessions(): SessionKey[] {
    return this.sessionMgr.listSessions();
  }

  /** Validate a session key for a specific operation. */
  validateSession(publicKey: Uint8Array, contractUrl: string, fn: string): void {
    this.sessionMgr.validate(publicKey, contractUrl, fn);
  }

  // ---- Recovery ----

  /** Configure social recovery guardians. */
  async setGuardians(guardians: string[], threshold: number): Promise<void> {
    if (threshold <= 0 || threshold > guardians.length) {
      throw new Error(`Threshold must be between 1 and ${guardians.length}`);
    }
    this.guardians = [...guardians];
    this.guardianThreshold = threshold;
  }

  /** Initiate a social recovery process. */
  async initiateRecovery(newKey: Uint8Array): Promise<RecoveryRequest> {
    if (this.guardians.length === 0) {
      throw new Error('No guardians configured');
    }
    return {
      newKey,
      guardians: [...this.guardians],
      threshold: this.guardianThreshold,
      approvals: [],
      status: 'pending',
    };
  }

  // ---- Sponsorship ----

  /** Register a gas sponsorship configuration. */
  async registerSponsor(config: SponsorConfig): Promise<void> {
    if (!this.rpcUrl) {
      // No endpoint configured — store the config locally for later submission.
      this.localSponsorConfig = config;
      console.warn('InfrixWallet: no rpcUrl configured — sponsor config stored locally');
      return;
    }

    // Build a registration transaction and submit to the sponsor registry.
    const params: Record<string, unknown> = {
      sponsor: this.adi,
      contracts: config.contracts ?? [],
      callers: config.callers ?? [],
      maxGasPerTx: config.maxGasPerTx ?? 0,
      dailyLimit: config.dailyLimit ?? 0,
    };

    try {
      await this.rpc('sponsor.register', params);
    } catch {
      // If the on-chain registration fails, keep the config locally so the
      // caller can retry.
      this.localSponsorConfig = config;
      throw new Error('Failed to register sponsor on-chain; config stored locally');
    }
  }

  // ---- Governance Operations ----

  /**
   * Submit an intent signed with the wallet's active key.
   *
   * @param goal - Intent goal (structured or natural language)
   * @param opts - Optional constraints, preferences
   * @returns IntentResult with intentId and status
   */
  async submitIntent(
    goal: IntentGoal | string,
    opts?: IntentSubmitOptions
  ): Promise<IntentResult> {
    const params: Record<string, unknown> = {
      userAddress: this.adi,
    };
    if (typeof goal === 'string') {
      params.rawInput = goal;
    } else {
      params.goal = goal;
    }
    if (opts?.constraints) params.constraints = opts.constraints;
    if (opts?.preferences) params.preferences = opts.preferences;
    if (opts?.metadata) params.metadata = opts.metadata;

    // Sign the intent submission
    if (this.activeKey) {
      const message = new TextEncoder().encode(JSON.stringify(params));
      const signature = await this.keyStore.sign(this.activeKey, message);
      params.signature = toHex(signature);
      params.publicKey = toHex(this.activeKey);
    }

    return this.rpc('intent.submit', params) as unknown as IntentResult;
  }

  /**
   * Approve an intent's execution plan with a signed ApprovalEnvelope.
   *
   * @param intentId - Intent to approve
   * @param planHash - Hash of the plan being approved (hex). If omitted, fetches the plan automatically.
   * @returns The signed ApprovalEnvelope
   */
  async approveIntent(
    intentId: string,
    planHash?: string
  ): Promise<ApprovalEnvelope> {
    // If planHash not provided, fetch the plan and compute it
    if (!planHash) {
      const plan = await this.rpc('intent.plan', { intentId });
      planHash = (plan as Record<string, unknown>).planHash as string;
    }

    return this.signApproval(intentId, planHash!);
  }

  /**
   * Create and submit a signed ApprovalEnvelope.
   *
   * Signs the plan hash with the wallet's active key and submits
   * the approval to the network.
   *
   * @param targetId - ID of the target being approved
   * @param planHash - Hash of the plan/state being approved
   * @param opts - Optional: role, conditions, scope
   */
  async signApproval(
    targetId: string,
    planHash: string,
    opts?: { role?: string; conditions?: Record<string, unknown> }
  ): Promise<ApprovalEnvelope> {
    if (!this.activeKey) {
      throw new Error('No active key. Call generateKey() first.');
    }

    const signaturePayload = approvalSignaturePayload(targetId, planHash, this.adi);
    const message = new TextEncoder().encode(signaturePayload);
    const signature = await this.keyStore.sign(this.activeKey, message);

    const params: Record<string, unknown> = {
      intentId: targetId,
      targetType: 'intent',
      targetId,
      planHash,
      actor: this.adi,
      identity: this.adi,
      purpose: 'approval',
      workflowInstance: targetId,
      signature: toHex(signature),
      signerPublicKey: toHex(this.activeKey),
      signatureAlgorithm: 'ed25519',
      signaturePayload,
      ...opts,
    };

    return this.rpc('approval.submit', params) as unknown as ApprovalEnvelope;
  }

  /**
   * Get the outcome of a completed intent.
   *
   * @param intentId - The intent ID
   */
  async getIntentOutcome(intentId: string): Promise<OutcomeRecord> {
    return this.rpc('intent.outcome', { intentId }) as unknown as OutcomeRecord;
  }

  /**
   * Get the evidence bundle for an intent.
   *
   * @param intentId - The intent ID
   */
  async getEvidence(intentId: string): Promise<EvidenceBundle> {
    return this.rpc('intent.evidence', { intentId }) as unknown as EvidenceBundle;
  }

  /**
   * Check if this wallet has a specific capability.
   *
   * @param capability - Capability string to check
   * @param scope - Optional scope constraint
   */
  async hasCapability(
    capability: string,
    scope?: string
  ): Promise<boolean> {
    const result = await this.rpc('capability.check', {
      identity: this.adi,
      capability,
      scope,
    });
    return (result as Record<string, unknown>).granted as boolean;
  }

  /**
   * Check if this wallet has a specific role.
   *
   * @param role - Role name to check
   * @param scope - Optional scope constraint
   */
  async hasRole(role: string, scope?: string): Promise<boolean> {
    const result = await this.rpc('role.check', {
      identity: this.adi,
      role,
      scope,
    });
    return (result as Record<string, unknown>).hasRole as boolean;
  }

  // ---- Internal RPC ----

  private async rpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() });
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result as Record<string, unknown>;
  }
}

function approvalSignaturePayload(targetId: string, planHash: string, identity: string): string {
  if (!targetId) throw new Error('approval signature requires targetId');
  if (!planHash) throw new Error('approval signature requires planHash');
  if (!identity) throw new Error('approval signature requires identity');
  return ['infrix-approval-v1', targetId, planHash, identity].join(':');
}
