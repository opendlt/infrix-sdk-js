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
 *     contract: 'acc://game.acme/counter',
 *     function: 'increment',
 *     args: '[]',
 *   },
 * });
 * ```
 */

import { toHex } from './crypto';
import { ApprovalSigningRequest, bindApprovalSigningRequest, hash32Hex } from './approval-signing';
import { MemoryKeyStore, KeyStore, KeyInfo } from './keystore';
import { SessionManager, SessionScope, SessionKey } from './session';
import type {
  IntentGoal,
  IntentResult,
  IntentSubmitOptions,
  ApprovalEnvelope,
  OutcomeRecord,
  IntentEvidenceAnswer,
} from './governance-types';

/** Options for creating a wallet. */
export interface WalletOptions {
  /** JSON-RPC endpoint URL. Default: http://localhost:8080/rpc */
  rpcUrl?: string;
  /** Custom key store implementation. Default: MemoryKeyStore */
  keyStore?: KeyStore;
  /**
   * Bearer token for a node that enforces `api.auth`; sent as `Authorization: Bearer <token>`. A node
   * that enforces it answers 401 to every wallet call without it. Held out of reach of enumeration
   * (JSON.stringify(wallet) does not show it).
   */
  token?: string;
}

/**
 * Refuse, by name, the `scope` argument the capability and role checks no longer take: the routes
 * (GET /v4/capabilities/check, GET /v4/roles/check) take an identity and a name and nothing else, and a
 * JavaScript caller that still passes a scope would otherwise get the answer to an unscoped question.
 */
function refuseRemovedScope(method: string, passed: readonly unknown[]): void {
  if (passed.some((v) => v !== undefined)) {
    throw new Error(`${method} no longer accepts scope: the route does not take it`);
  }
}

/** Bearer tokens by wallet, out of reach of enumeration. */
const walletTokens = new WeakMap<object, string>();

/** Social recovery request. */
export interface RecoveryRequest {
  newKey: Uint8Array;
  guardians: string[];
  threshold: number;
  approvals: string[];
  status: string;
}

/**
 * A wallet amount (balance/credits) with provenance + verification state, so a
 * caller can distinguish a real zero from an unknown (failed) query.
 */
export interface WalletAmountResult {
  amount: bigint;
  /** Where the amount came from. */
  source: 'node' | 'l0' | 'cache';
  /** True only when the amount was actually read from the source. */
  verified: boolean;
  /** When verified is false, why the amount is unavailable. */
  unavailableReason?: string;
}

/** Sponsorship configuration. */
export interface SponsorConfig {
  contracts?: string[];
  callers?: string[];
  maxGasPerTx?: number;
  dailyLimit?: number;
}

/** Options for approveIntent / signApproval. */
export interface ApproveIntentOptions {
  /** Accumulate key page whose entry is sha256(active public key). */
  keyPageRef: string;
  /** Why the approval is given (>= 10 characters); recorded with it. */
  rationale: string;
  /** Approval stage; defaults to the plan's only required stage. */
  stageId?: string;
  /** Role signed as; defaults to the stage's only eligible role. */
  role?: string;
}

/** approval.submit's stage-path result. */
export interface ApprovalSubmitResult {
  approvalId: string;
  rationaleNoteId?: string;
  status: 'resumed' | 'awaiting_more_approvals';
  succeeded?: boolean;
  outcomeId?: string;
  evidenceId?: string;
  anchorId?: string;
  detail?: string;
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
    const token = options?.token?.trim();
    if (token) walletTokens.set(this, token);
    this.keyStore = options?.keyStore || new MemoryKeyStore();
    this.sessionMgr = new SessionManager(adi, this.keyStore);
  }

  // ---- Account Info ----

  /**
   * Query the wallet's token balance, distinguishing a REAL zero from an
   * unknown (failed/unconfigured) query. Never silently reports zero on
   * failure — `verified` is false and `unavailableReason` says why.
   */
  async balanceStatus(): Promise<WalletAmountResult> {
    return this.amountStatus('account.balance', 'balance');
  }

  /**
   * Query the wallet's credit balance with the same honesty contract as
   * {@link balanceStatus}. Never returns a hard-coded zero.
   */
  async creditsStatus(): Promise<WalletAmountResult> {
    return this.amountStatus('account.credits', 'credits', 'creditBalance');
  }

  /**
   * Get the wallet's token balance. Throws if the balance cannot be verified
   * (node unreachable, account not on-chain, or method unsupported) — it never
   * silently returns zero on a failed query. Use {@link tryBalance} for
   * non-throwing behaviour, or {@link balanceStatus} for the full state.
   */
  async balance(): Promise<bigint> {
    const s = await this.balanceStatus();
    if (!s.verified) {
      throw new Error(`InfrixWallet: balance unavailable for ${this.adi}: ${s.unavailableReason}`);
    }
    return s.amount;
  }

  /** Non-throwing balance: returns the verified amount, or null if unavailable. */
  async tryBalance(): Promise<bigint | null> {
    const s = await this.balanceStatus();
    return s.verified ? s.amount : null;
  }

  /**
   * Get the wallet's credit balance from a real source. Throws if it cannot be
   * verified — it never returns a hard-coded or silent zero.
   */
  async credits(): Promise<bigint> {
    const s = await this.creditsStatus();
    if (!s.verified) {
      throw new Error(`InfrixWallet: credits unavailable for ${this.adi}: ${s.unavailableReason}`);
    }
    return s.amount;
  }

  /** Non-throwing credits: returns the verified amount, or null if unavailable. */
  async tryCredits(): Promise<bigint | null> {
    const s = await this.creditsStatus();
    return s.verified ? s.amount : null;
  }

  /**
   * Shared amount query: calls the node method, parses the first present field,
   * and reports verified/unavailable HONESTLY (no silent zero). `fields` are
   * tried in order on the response.
   */
  private async amountStatus(method: string, ...fields: string[]): Promise<WalletAmountResult> {
    if (!this.rpcUrl) {
      return { amount: 0n, source: 'node', verified: false, unavailableReason: 'no rpcUrl configured' };
    }
    let result: Record<string, unknown>;
    try {
      result = await this.rpc(method, { url: this.adi });
    } catch (e) {
      return {
        amount: 0n,
        source: 'node',
        verified: false,
        unavailableReason: e instanceof Error ? e.message : String(e),
      };
    }
    for (const f of fields) {
      const amount = toBigIntOrNull(result[f]);
      if (amount !== null) {
        return { amount, source: 'node', verified: true };
      }
    }
    return {
      amount: 0n,
      source: 'node',
      verified: false,
      unavailableReason: `node response for ${method} had no ${fields.join('/')} field`,
    };
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
   * Approve a parked intent's approval stage with a signature the node's
   * approval store verifies.
   *
   * Fetches the canonical signing material for this wallet's ADI
   * (`approval.signing`), recomputes the node's digest from the published
   * fields and refuses to sign on a mismatch, binds the active key, signs the
   * canonical approval preimage, and submits it through `approval.submit`.
   * The node verifies the signature against `keyPageRef` on Accumulate L0:
   * sha256(active public key) must be an entry on that page, the page must
   * belong to this ADI, and the ADI must hold the role.
   *
   * @param intentId - The parked intent
   * @param opts - keyPageRef (required), rationale (required, >= 10 chars),
   *               stageId / role (optional when the plan has exactly one)
   */
  async approveIntent(intentId: string, opts: ApproveIntentOptions): Promise<ApprovalSubmitResult> {
    return this.signApproval(intentId, opts);
  }

  /**
   * Sign and submit an approval for a parked stage (see approveIntent).
   *
   * Session 37 (S24): this used to sign "infrix-approval-v1:<id>:<planHash>:<adi>"
   * — a payload no approval store verifies — so no wallet approval could ever
   * unpark a plan.
   */
  async signApproval(intentId: string, opts: ApproveIntentOptions): Promise<ApprovalSubmitResult> {
    if (!this.activeKey) {
      throw new Error('No active key. Call generateKey() first.');
    }
    if (!opts || !opts.keyPageRef) {
      throw new Error('keyPageRef is required: the Accumulate key page whose entry is the signing key hash');
    }
    if (!opts.rationale || opts.rationale.trim().length < 10) {
      throw new Error('rationale is required (at least 10 characters): the node records why every approval was signed');
    }
    const disclosure = { actor: this.adi, purpose: 'approval', workflowInstance: intentId };
    const material = (await this.rpc('approval.signing', {
      ...disclosure,
      intentId,
      keyPageRef: opts.keyPageRef,
      ...(opts.stageId ? { stageId: opts.stageId } : {}),
      ...(opts.role ? { role: opts.role } : {}),
    })) as unknown as ApprovalSigningRequest;
    if (material.signerIdentity !== this.adi) {
      throw new Error(`the node bound the signing material to ${material.signerIdentity}, not to ${this.adi} — refusing to sign`);
    }
    const { bound, preimage } = await bindApprovalSigningRequest(material, this.activeKey);
    const signature = await this.keyStore.sign(this.activeKey, preimage);

    return (await this.rpc('approval.submit', {
      ...disclosure,
      intentId,
      stageId: bound.stageId,
      planHash: hash32Hex(bound.planHash),
      role: bound.signerRole ?? '',
      keyPageRef: bound.keyPageRef,
      signature: toHex(signature),
      signerPublicKey: toHex(this.activeKey),
      signatureAlgorithm: 'ed25519',
      rationale: opts.rationale,
    })) as unknown as ApprovalSubmitResult;
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
   * Get the evidence an intent produced (`intent.evidence`, GET /v4/intents/{id}/evidence): the
   * intent's `bundles` and their `count`, with the `intent` and its `intentId`. A bundle's own `id` is
   * the evidence id the evidence routes take; this answer is not itself a bundle. An answer that lacks
   * a member the route declares is refused rather than read as "no evidence".
   *
   * @param intentId - The intent ID
   */
  async getEvidence(intentId: string): Promise<IntentEvidenceAnswer> {
    const answer = await this.rpc('intent.evidence', { intentId });
    for (const member of ['bundles', 'count', 'intent', 'intentId']) {
      if (answer[member] === undefined) {
        throw new Error(`the node's answer to intent.evidence carries no ${member}`);
      }
    }
    if (!Array.isArray(answer.bundles)) {
      throw new Error("the node's answer to intent.evidence carries bundles that are not a list");
    }
    return answer as unknown as IntentEvidenceAnswer;
  }

  /**
   * Check if this wallet has a specific capability.
   *
   * @param capability - Capability string to check
   * @param removed - Refused: the route takes no `scope`, so one cannot be asked about.
   */
  async hasCapability(
    capability: string,
    ...removed: never[]
  ): Promise<boolean> {
    refuseRemovedScope('wallet.hasCapability', removed);
    const result = await this.rpc('capability.check', {
      identity: this.adi,
      capability,
    });
    return (result as Record<string, unknown>).granted as boolean;
  }

  /**
   * Check if this wallet has a specific role.
   *
   * @param role - Role name to check
   * @param removed - Refused: the route takes no `scope`, so one cannot be asked about.
   */
  async hasRole(role: string, ...removed: never[]): Promise<boolean> {
    refuseRemovedScope('wallet.hasRole', removed);
    const result = await this.rpc('role.check', {
      identity: this.adi,
      role,
    });
    return (result as Record<string, unknown>).hasRole as boolean;
  }

  // ---- Internal RPC ----

  private async rpc(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = walletTokens.get(this);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers,
      body,
    });
    if (res.status === 401) {
      throw new Error(
        'NODE_AUTH_REQUIRED: the node answered 401: it enforces api.auth and ' +
          (token ? 'the token this wallet sent was not accepted' : 'this wallet sent no token (pass `token` in WalletOptions)'),
      );
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result as Record<string, unknown>;
  }
}

/** Parse a node-returned amount field into a bigint, or null if absent/invalid. */
function toBigIntOrNull(raw: unknown): bigint | null {
  try {
    if (typeof raw === 'bigint') return raw;
    if (typeof raw === 'number' && Number.isFinite(raw)) return BigInt(Math.trunc(raw));
    if (typeof raw === 'string' && raw.trim() !== '') return BigInt(raw);
  } catch {
    return null;
  }
  return null;
}

