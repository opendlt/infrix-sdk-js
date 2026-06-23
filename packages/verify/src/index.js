// @infrix/verify — the canonical browser-side Infrix verifier closure, shared by
// the Infrix SDK packages and Nexus (single source of truth: pkg/nexus/web,
// vendored here by scripts/vendor.mjs). Re-exports the verification core; the
// DOM receipt view is available at the './proofReceiptView.js' subpath.
export * from './portableVerifier.js';
export * from './proofReceipt.js';
export * from './canonicalJson.js';
export * from './proofStory.js';
export * from './uxLabels.js';
