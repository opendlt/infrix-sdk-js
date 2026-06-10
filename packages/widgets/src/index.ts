// @infrix/widgets — Embedded Verification Widget Kit (nextux-09).
//
// React components that embed Infrix proof verification, receipts, Cinema replay,
// task cards, and trust-boundary explanations in any app. Verification runs
// in-browser with NO node trust by default; nothing leaves the browser unless an
// L0 endpoint is explicitly supplied. A framework-neutral Web Component build
// lives in @infrix/widgets-webcomponent.

export { InfrixProofReceipt } from './ProofReceipt.js';
export type { InfrixProofReceiptProps } from './ProofReceipt.js';
export { InfrixVerifyButton } from './VerifyButton.js';
export type { InfrixVerifyButtonProps } from './VerifyButton.js';
export { InfrixCinemaReplay, extractCinemaSteps } from './CinemaReplay.js';
export type { InfrixCinemaReplayProps, CinemaStep } from './CinemaReplay.js';
export { InfrixTrustBoundary } from './TrustBoundary.js';
export type { InfrixTrustBoundaryProps } from './TrustBoundary.js';
export { InfrixTaskCard } from './TaskCard.js';
export type { InfrixTaskCardProps, TaskCardData } from './TaskCard.js';
export { InfrixProofStory } from './ProofStory.js';
export type { InfrixProofStoryProps } from './ProofStory.js';
export { InfrixErrorResolution } from './ErrorResolution.js';
export type { InfrixErrorResolutionProps } from './ErrorResolution.js';

// The framework-neutral verification core (also usable directly).
export {
  verifyBundle,
  verifyStory,
  verifyReceiptResult,
  badges,
  assuranceBadgesFor,
  assuranceState,
  canonicalBadges,
} from './verifier.js';
export type { VerifyResult, VerifyOptions, VerifyKind, VerifyStatus, VerifyCheck, AssuranceState, CanonicalBadge } from './verifier.js';

export { resolveErrorCard } from './errors.js';
export type { ErrorCard, ErrorFix } from './errors.js';

export { WIDGET_STYLES, ensureStyles } from './styles.js';
export type { CommonProps, Theme, Variant } from './shared.js';
