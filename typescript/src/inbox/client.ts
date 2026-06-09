/**
 * Proof Inbox client (nextux-07).
 *
 * A thin, typed wrapper over the Agent Action Protocol inbox.* actions. Read-only
 * actions (list, summarize, verify, prepareDecision) run directly; the mutating
 * ones (import, comment, signDecision) flow through the same approval gate every
 * agent action uses, so the client surfaces the AgentResponse (including its
 * approvalRequest) rather than hiding the safety step.
 *
 * Decision authority: an agent may PREPARE a decision but may only SIGN one when
 * its session was granted signing authority — signDecision fails closed with
 * AGENT_SIGNING_DENIED otherwise.
 */

import { InfrixAgentClient } from '../agent/client';
import type { RunOptions } from '../agent/client';
import type { AgentResponse, ApprovalToken } from '../agent/actions';
import type { InboxItem, SharedSummary, DecisionType, DecisionReceipt } from './item';
import { verifyDecisionReceipt } from './decision';
import type { DecisionVerifyResult } from './decision';

export interface ImportArgs {
  artifact?: unknown;
  artifactPath?: string;
  kind?: string;
  sender?: string;
  recipient?: string;
  ask?: string;
  l0Endpoint?: string;
}

export interface DecisionArgs {
  reason?: string;
  delegateTo?: string;
  signer?: string;
}

/** InfrixInboxClient drives the proof inbox over the agent action endpoint. */
export class InfrixInboxClient {
  private agent: InfrixAgentClient;

  constructor(agent: InfrixAgentClient) {
    this.agent = agent;
  }

  /** List the redaction-safe summaries of inbox items. */
  async list(opts: { archived?: boolean } = {}): Promise<SharedSummary[]> {
    const resp = await this.agent.run('inbox.list', { archived: !!opts.archived });
    const data = (resp.data ?? {}) as { items?: SharedSummary[] };
    return data.items ?? [];
  }

  /** Return the redaction-safe shared summary of one item. */
  async summarize(itemId: string): Promise<SharedSummary | undefined> {
    const resp = await this.agent.run('inbox.summarize', { itemId });
    return (resp.data as { summary?: SharedSummary } | undefined)?.summary;
  }

  /** Independently re-verify an item's artifact (trusts no node). */
  async verify(itemId: string, l0Endpoint?: string): Promise<AgentResponse> {
    return this.agent.run('inbox.verify', { itemId, l0Endpoint });
  }

  /** Import + independently verify an artifact (mutating — needs approval). */
  async import(args: ImportArgs, approval?: ApprovalToken): Promise<AgentResponse> {
    return this.agent.run('inbox.import', { ...args } as Record<string, unknown>, (approval ? { approval } : {}) as RunOptions);
  }

  /** Add a review comment (mutating — needs approval). Never alters the proof. */
  async comment(itemId: string, body: string, author?: string, approval?: ApprovalToken): Promise<AgentResponse> {
    return this.agent.run('inbox.comment', { itemId, body, author }, (approval ? { approval } : {}) as RunOptions);
  }

  /** Prepare an UNSIGNED decision body + hash for an authorized signer (read-only). */
  async prepareDecision(itemId: string, type: DecisionType, args: DecisionArgs = {}): Promise<AgentResponse> {
    return this.agent.run('inbox.prepareDecision', { itemId, type, ...args });
  }

  /** Sign + record a decision. Requires a session granted signing authority
   *  (mutating — needs approval). */
  async signDecision(itemId: string, type: DecisionType, args: DecisionArgs = {}, approval?: ApprovalToken): Promise<AgentResponse> {
    return this.agent.run('inbox.signDecision', { itemId, type, ...args }, (approval ? { approval } : {}) as RunOptions);
  }

  /** Verify a decision receipt offline (no node trust). */
  static verifyReceipt(receipt: DecisionReceipt): DecisionVerifyResult {
    return verifyDecisionReceipt(receipt);
  }
}

export type { InboxItem };
