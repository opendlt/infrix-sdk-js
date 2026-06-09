/**
 * Approval helpers for the Agent Action Protocol.
 *
 * The agent never mints approvals itself — the server signs them, bound to the
 * exact action + input hash. These helpers just shape the request/response and
 * surface whether a response is asking for approval.
 */

import type { AgentResponse, ApprovalRequest, ApprovalToken } from './actions';

/**
 * needsApproval reports whether a response is blocked pending human approval.
 */
export function needsApproval(resp: AgentResponse): boolean {
  return !resp.ok && resp.approvalRequest != null &&
    resp.errors.some((e) => e.code === 'AGENT_APPROVAL_REQUIRED');
}

/**
 * approvalRequestOf returns the approval request a response is asking for, or
 * null.
 */
export function approvalRequestOf(resp: AgentResponse): ApprovalRequest | null {
  return resp.approvalRequest ?? null;
}

/**
 * isExpired reports whether an approval token is past its window (nowSeconds
 * defaults to the current time).
 */
export function isExpired(tok: ApprovalToken, nowSeconds?: number): boolean {
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  return tok.expiresAt > 0 && now >= tok.expiresAt;
}
