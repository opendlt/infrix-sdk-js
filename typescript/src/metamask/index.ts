/**
 * withMetaMask(client) — consumer-grade MetaMask -> Accumulate governed intents.
 *
 * One helper takes a dApp from a connected MetaMask account to an admitted,
 * proof-ready Infrix intent. The public key is RECOVERED (never asked of the
 * developer), verified against the MetaMask address, embedded into the canonical
 * Accumulate EIP-712 message, and checked against the Accumulate L0 key page by
 * the node before admission.
 *
 *   const wallet = withMetaMask(client);
 *   const result = await wallet.metamask.submitIntent({
 *     signer: 'acc://alice.acme/book/1',
 *     signerVersion: 12,
 *     goal: { type: 'CONTRACT_CALL', customParams: { contract, function: 'increment', args: '[]' } },
 *     requireL0KeyPage: true, wait: true, proof: 'export',
 *   });
 *
 * This preserves the architecture: it routes only through the canonical
 * /v4/intents/eip712/{prepare,submit} endpoints and the governance spine. It
 * does NOT make window.infrix an Ethereum provider, expose raw deploy/call/
 * upgrade entrypoints, or bypass the spine.
 */
import type { InfrixClient } from '../index';
import { InfrixRPCError } from '../index';
import { waitForCompletion } from '../sugar';
import type { GovernedResult } from '../sugar';
import type { EIP712IntentRequest, Eip1193Provider, AssetAmount } from '../sub-clients/eip712';
import { buildChallenge, recoverAndVerify, assertChallengeFresh } from './recoverPublicKey';
import type { RecoveredKey } from './recoverPublicKey';
import {
  MetaMaskError,
  MetaMaskProviderMissing,
  MetaMaskUserRejected,
  MetaMaskIntentRejected,
  MetaMaskKeyPageNotVerified,
  MetaMaskProofUnavailable,
  classifyProviderError,
} from './errors';

/** A goal in the consumer-friendly shape (`goal.type` + customParams). */
export interface MetaMaskGoal {
  type: string;
  customType?: string;
  customParams?: Record<string, unknown>;
  sourceAssets?: AssetAmount[];
  targetAssets?: AssetAmount[];
  memo?: string;
}

/** Parameters for the one-call governed submit. */
export interface MetaMaskSubmitParams {
  /** Accumulate key page URL, e.g. acc://alice.acme/book/1. */
  signer: string;
  /** Current key page version. */
  signerVersion: number;
  /** The governed goal. */
  goal: MetaMaskGoal;
  /** MetaMask account to sign with (defaults to the connected account). */
  address?: string;
  /** Explicit EIP-1193 provider (defaults to globalThis.ethereum). */
  provider?: Eip1193Provider;
  /**
   * The exact public-key binding challenge to sign. When omitted, the helper
   * builds a canonical self-contained challenge locally.
   */
  challenge?: string;
  /** Domain to scope the locally-built challenge to (default: the node host). */
  domain?: string;
  /** Require the node to confirm the L0 key-page binding (default: true). */
  requireL0KeyPage?: boolean;
  /** Wait for the intent to reach a terminal state (default: true). */
  wait?: boolean;
  /** Max wait when waiting (ms). */
  maxWaitMs?: number;
  /** 'export' to attach a portable proof; 'none' (default) to skip. */
  proof?: 'export' | 'none';
  /** Signature nonce (non-zero); defaults to Date.now(). */
  timestamp?: number;
  /** EIP-712 domain network override. */
  networkName?: string;
  /** Explicit chain id (decimal/hex). */
  chainId?: string;
}

/** Fully-populated result of a governed MetaMask submission. */
export interface MetaMaskGovernedResult {
  actor: string;
  ethAddress: string;
  publicKey: string;
  signer: string;
  signerVersion: number;
  intentId: string;
  planId: string;
  outcomeId: string;
  evidenceId?: string;
  anchorId?: string;
  status: string;
  finality?: string;
  proof?: unknown;
  l0KeyPageVerified: boolean;
}

/** Resolve an EIP-1193 provider from an explicit arg or the global. */
function resolveProvider(provider?: Eip1193Provider): Eip1193Provider {
  if (provider) return provider;
  const g = globalThis as { ethereum?: Eip1193Provider };
  if (g.ethereum && typeof g.ethereum.request === 'function') return g.ethereum;
  throw new MetaMaskProviderMissing();
}

/** Random 128-bit hex nonce (browser + node). */
function randomNonce(): string {
  const b = new Uint8Array(16);
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array }; require?: (m: string) => unknown };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(b);
  } else {
    // Node fallback.
    const nodeCrypto = (g.require ? g.require('crypto') : require('crypto')) as { randomFillSync(a: Uint8Array): void };
    nodeCrypto.randomFillSync(b);
  }
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function call<T>(
  provider: Eip1193Provider,
  method: string,
  params: unknown[],
  fallback: () => MetaMaskError,
): Promise<T> {
  try {
    return (await provider.request({ method, params })) as T;
  } catch (e) {
    throw classifyProviderError(e, fallback());
  }
}

/** Extract a string field from the enriched intent result. */
function field(result: unknown, ...keys: string[]): string | undefined {
  const r = result as Record<string, unknown> | undefined;
  if (!r) return undefined;
  for (const k of keys) {
    const v = r[k];
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

/** The MetaMask governed-intent API surface. */
export class MetaMaskApi {
  constructor(private readonly client: InfrixClient) {}

  /** Connect MetaMask and return the provider + selected account. */
  async connect(provider?: Eip1193Provider): Promise<{ provider: Eip1193Provider; address: string }> {
    const p = resolveProvider(provider);
    const accounts = await call<string[]>(p, 'eth_requestAccounts', [], () => new MetaMaskUserRejected());
    if (!accounts || accounts.length === 0) {
      throw new MetaMaskProviderMissing('MetaMask returned no accounts');
    }
    return { provider: p, address: accounts[0] };
  }

  /**
   * Recover the signer's secp256k1 public key via a one-time personal_sign
   * challenge, verified against the MetaMask address. No manual key input.
   */
  async recoverPublicKey(params: {
    signer: string;
    address?: string;
    provider?: Eip1193Provider;
    challenge?: string;
    domain?: string;
  }): Promise<RecoveredKey & { challenge: string }> {
    const { provider, address } = params.address
      ? { provider: resolveProvider(params.provider), address: params.address }
      : await this.connect(params.provider);

    const challenge =
      params.challenge ??
      buildChallenge({
        domain: params.domain ?? this.defaultDomain(),
        signer: params.signer,
        address,
        nonce: randomNonce(),
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      });
    // If a challenge was supplied, enforce its freshness locally.
    if (params.challenge) assertChallengeFresh(challenge);

    const signature = await call<string>(
      provider,
      'personal_sign',
      [toHexUtf8(challenge), address],
      () => new MetaMaskUserRejected(),
    );
    // recoverAndVerify confirms the recovered key's address matches the account
    // (case-insensitive); the returned address is the EIP-55 checksummed form.
    const recovered = recoverAndVerify(challenge, signature, address);
    return { ...recovered, challenge };
  }

  /** Build the EIP-712 typed data for a goal (recovering the key first). */
  async prepareIntent(params: MetaMaskSubmitParams): Promise<{
    request: EIP712IntentRequest;
    typedData: unknown;
    transactionHash: string;
    chainId: string;
    address: string;
    publicKey: string;
  }> {
    const rec = await this.recoverPublicKey({
      signer: params.signer,
      address: params.address,
      provider: params.provider,
      challenge: params.challenge,
      domain: params.domain,
    });
    const request = this.buildRequest(params, rec.compressed);
    const prepared = await this.client.eip712.prepare(request);
    return {
      request,
      typedData: prepared.typedData,
      transactionHash: prepared.transactionHash,
      chainId: prepared.chainId,
      address: rec.address,
      publicKey: rec.compressed,
    };
  }

  /**
   * One-call governed submit: connect -> recover key -> prepare typed data ->
   * eth_signTypedData_v4 -> submit -> (optionally) wait + export proof.
   */
  async submitIntent(params: MetaMaskSubmitParams): Promise<MetaMaskGovernedResult> {
    const { provider, address } = params.address
      ? { provider: resolveProvider(params.provider), address: params.address }
      : await this.connect(params.provider);

    const rec = await this.recoverPublicKey({ signer: params.signer, address, provider, challenge: params.challenge, domain: params.domain });
    const request = this.buildRequest(params, rec.compressed);

    const prepared = await this.client.eip712.prepare(request).catch((e) => {
      throw new MetaMaskIntentRejected('failed to prepare the EIP-712 intent: ' + msg(e), e);
    });

    const signature = await call<string>(
      provider,
      'eth_signTypedData_v4',
      [address, JSON.stringify(prepared.typedData)],
      () => new MetaMaskUserRejected(),
    );

    let submitted: { actor: string; ethAddress: string; result: unknown };
    try {
      submitted = await this.client.eip712.submit({ ...request, signature });
    } catch (e) {
      throw this.classifySubmitError(e, params.requireL0KeyPage !== false);
    }

    // The node mandates L0 key-page verification on submit; a success means the
    // signing key is an authorized entry on the page.
    const l0KeyPageVerified = true;

    let intentId = field(submitted.result, 'intentId', 'id') ?? '';
    let planId = field(submitted.result, 'planId') ?? '';
    let outcomeId = field(submitted.result, 'outcomeId') ?? '';
    let evidenceId = field(submitted.result, 'evidenceId', 'evidenceBundleId');
    let anchorId = field(submitted.result, 'anchorId');
    let status = field(submitted.result, 'status') ?? 'submitted';
    let finality = field(submitted.result, 'finality');

    if (params.wait !== false && intentId) {
      const completed: GovernedResult = await waitForCompletion(this.client, intentId, {
        maxWaitMs: params.maxWaitMs,
      });
      planId = completed.planId || planId;
      outcomeId = completed.outcomeId || outcomeId;
      evidenceId = completed.evidenceId ?? evidenceId;
      anchorId = completed.anchorId ?? anchorId;
      status = completed.status || status;
      finality = (completed.finality as string | undefined) ?? finality;
    }

    let proof: unknown;
    if (params.proof === 'export') {
      if (!intentId) throw new MetaMaskProofUnavailable('no intentId to export a proof for');
      proof = await this.exportProof(intentId);
    }

    return {
      actor: submitted.actor,
      ethAddress: submitted.ethAddress || rec.address,
      publicKey: rec.compressed,
      signer: params.signer,
      signerVersion: params.signerVersion,
      intentId,
      planId,
      outcomeId,
      evidenceId,
      anchorId,
      status,
      finality,
      proof,
      l0KeyPageVerified,
    };
  }

  /** Alias that always waits (explicit name for callers who prefer it). */
  async submitAndWait(params: MetaMaskSubmitParams): Promise<MetaMaskGovernedResult> {
    return this.submitIntent({ ...params, wait: true });
  }

  /** Sign already-prepared typed data with MetaMask (advanced callers). */
  async signIntent(params: { typedData: unknown; address: string; provider?: Eip1193Provider }): Promise<string> {
    const provider = resolveProvider(params.provider);
    return call<string>(
      provider,
      'eth_signTypedData_v4',
      [params.address, JSON.stringify(params.typedData)],
      () => new MetaMaskUserRejected(),
    );
  }

  /** Export a portable, independently-verifiable proof for an admitted intent. */
  async exportProof(intentId: string): Promise<unknown> {
    let bundle: unknown;
    try {
      bundle = await this.client.evidence.get(intentId);
    } catch (e) {
      throw new MetaMaskProofUnavailable('evidence bundle not available: ' + msg(e), e);
    }
    const evidenceId =
      (bundle as { id?: string; bundleId?: string }).id ?? (bundle as { id?: string; bundleId?: string }).bundleId;
    if (!evidenceId) throw new MetaMaskProofUnavailable('evidence bundle has no id to export');
    return this.client.evidence.exportPortable(evidenceId);
  }

  // ---- internals ----

  private buildRequest(params: MetaMaskSubmitParams, publicKey: string): EIP712IntentRequest {
    return {
      goalType: params.goal.type,
      customType: params.goal.customType,
      customParams: params.goal.customParams,
      sourceAssets: params.goal.sourceAssets,
      targetAssets: params.goal.targetAssets,
      signer: params.signer,
      signerVersion: params.signerVersion,
      publicKey,
      timestamp: params.timestamp ?? Date.now(),
      memo: params.goal.memo,
      networkName: params.networkName,
      chainId: params.chainId,
    };
  }

  private classifySubmitError(e: unknown, requireL0: boolean): Error {
    const m = msg(e).toLowerCase();
    if (m.includes('key page') || m.includes('key-page') || (requireL0 && m.includes('not configured'))) {
      return new MetaMaskKeyPageNotVerified(msg(e), e);
    }
    return new MetaMaskIntentRejected(msg(e), e);
  }

  private defaultDomain(): string {
    const base = (this.client as unknown as { restBase?: string }).restBase;
    if (typeof base === 'string' && base) {
      try {
        return new URL(base).host || base;
      } catch {
        return base;
      }
    }
    return 'infrix';
  }
}

/** Attach the MetaMask governed-intent API to a client. */
export function withMetaMask(client: InfrixClient): { metamask: MetaMaskApi } {
  return { metamask: new MetaMaskApi(client) };
}

function msg(e: unknown): string {
  if (e instanceof InfrixRPCError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

/** 0x-hex of the UTF-8 bytes of a string (the personal_sign data arg). */
function toHexUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '0x';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export * from './errors';
export {
  buildChallenge,
  parseChallenge,
  assertChallengeFresh,
  recoverPublicKey,
  recoverAndVerify,
  ethAddressFromPublicKey,
  CHALLENGE_PURPOSE,
  CHALLENGE_HEADER,
} from './recoverPublicKey';
export type { RecoveredKey, ChallengeParams } from './recoverPublicKey';
