/**
 * Identity control-center client (nextux-08).
 *
 * A thin, typed wrapper over the Agent Action Protocol identity.* actions, plus
 * the local helpers (explain a signature, validate a session request, connect a
 * wallet) that need no server. Read-only actions run directly; requestSession /
 * revokeSession are mutating and flow through the same approval gate as any
 * agent action — a session request is refused without a capability scope.
 */

import { InfrixAgentClient } from '../agent/client';
import type { RunOptions } from '../agent/client';
import type { AgentResponse, ApprovalToken } from '../agent/actions';
import { explainSignature } from './signatures';
import type { SignatureRequest, Explanation } from './signatures';
import { normalizeSessionRequest, validateSessionRequest } from './sessions';
import type { SessionRequest, SessionView } from './sessions';
import { connectWithChallenge } from './metamask';
import type { WalletConnection } from './metamask';

export interface IdentityStatus {
  wallet: WalletConnection;
  accumulate?: {
    adi: string;
    keyPage: string;
    keyPageVersion?: number;
    ethAddress?: string;
    l0Verified: boolean;
    bindingChecked: boolean;
    detail?: string;
  };
  sessions: SessionView[];
  permissions: Permission[];
  signatureQueue: SignatureRequest[];
  history: SignedIntentRecord[];
  warnings: string[];
}

export interface Permission {
  kind: string;
  grantee?: string;
  capability: string;
  scope?: string;
  purpose?: string;
  expiresAt?: string;
  source: string;
  plain: string;
}

export interface SignedIntentRecord {
  txHash?: string;
  action: string;
  network: string;
  signer: string;
  ethAddress?: string;
  agentInitiated: boolean;
  signedAt: string;
  proofReceiptRef?: string;
}

/** InfrixIdentityClient drives the identity control center over the agent
 *  action endpoint, with local explanation/validation helpers. */
export class InfrixIdentityClient {
  private agent: InfrixAgentClient;

  constructor(agent: InfrixAgentClient) {
    this.agent = agent;
  }

  /** The aggregated identity status (wallet, sessions, permissions, warnings). */
  async status(): Promise<IdentityStatus | undefined> {
    const resp = await this.agent.run('identity.status');
    return (resp.data as { status?: IdentityStatus } | undefined)?.status;
  }

  /** Explain a signature request over the wire (the server computes it). */
  async explainSignatureRemote(request: SignatureRequest, expert = false): Promise<AgentResponse> {
    return this.agent.run('identity.explainSignature', { request, expert });
  }

  /** List the currently-granted capabilities. */
  async listPermissions(): Promise<Permission[]> {
    const resp = await this.agent.run('identity.listPermissions');
    return (resp.data as { permissions?: Permission[] } | undefined)?.permissions ?? [];
  }

  /** Request a scoped agent session (mutating — needs approval; a capability
   *  scope is mandatory and validated client-side before the call). */
  async requestSession(req: SessionRequest, approval?: ApprovalToken): Promise<AgentResponse> {
    const normalized = normalizeSessionRequest(req);
    validateSessionRequest(normalized); // fail fast on a scope-less/implicit-mainnet request
    return this.agent.run('identity.requestSession', normalized as unknown as Record<string, unknown>, (approval ? { approval } : {}) as RunOptions);
  }

  /** Revoke an agent session (mutating — needs approval). */
  async revokeSession(sessionId: string, approval?: ApprovalToken): Promise<AgentResponse> {
    return this.agent.run('identity.revokeSession', { sessionId }, (approval ? { approval } : {}) as RunOptions);
  }

  // ---- Local, no-server helpers ----

  /** Explain a signature request locally (no node). Throws if unexplainable. */
  static explain(request: SignatureRequest): Explanation {
    return explainSignature(request);
  }

  /** Verify a signed binding challenge and return the wallet connection. */
  static connect(challengeText: string, signatureHex: string, now?: string): WalletConnection {
    return connectWithChallenge(challengeText, signatureHex, { now });
  }
}
