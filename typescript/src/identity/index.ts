/**
 * @infrix identity — Wallet & Identity Control Center (nextux-08): a
 * cross-language signature explainer, scoped-session validation, MetaMask
 * challenge connect, and a typed client over the agent action surface.
 */

export { explainSignature, SignatureUnexplainableError } from './signatures';
export type { SignatureRequest, Explanation, AssetAmount } from './signatures';

export {
  normalizeSessionRequest,
  validateSessionRequest,
  sessionWarnings,
  SessionScopeError,
  DEFAULT_SESSION_TTL_SECONDS,
} from './sessions';
export type { SessionRequest, SessionView } from './sessions';

export { connectWithChallenge, disconnected, isConnected } from './metamask';
export type { WalletConnection, ConnectOptions } from './metamask';

export { InfrixIdentityClient } from './client';
export type { IdentityStatus, Permission, SignedIntentRecord } from './client';
