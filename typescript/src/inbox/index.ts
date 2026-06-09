/**
 * @infrix inbox — Proof Inbox + Collaboration types, an in-browser/in-Node
 * decision + receipt verifier, and a typed client over the agent action surface
 * (nextux-07).
 */

export * from './item';
export {
  canonicalDecisionBody,
  verifyDecision,
  verifyDecisionReceipt,
} from './decision';
export type { DecisionCheck, DecisionVerifyResult } from './decision';
export { InfrixInboxClient } from './client';
export type { ImportArgs, DecisionArgs } from './client';
