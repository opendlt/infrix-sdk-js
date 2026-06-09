/**
 * @infrix agent — the Agent Action Protocol client (nextux-01).
 */

export { InfrixAgentClient } from './client';
export type { InfrixAgentClientOptions, RunOptions, FetchLike } from './client';
export * from './actions';
export { needsApproval, approvalRequestOf, isExpired } from './approval';
export {
  assuranceOf,
  trustsNode,
  firstError,
  explainError,
  verifierCommand,
} from './receipts';
