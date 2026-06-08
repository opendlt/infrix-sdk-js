// @infrix/proof-receipt (adoption-10) — one import to verify an Infrix portable
// proof and render its receipt, with no trust in any node. Verification is
// OFFLINE (cryptographic structure): it answers "is this proof internally
// valid?" without contacting a server. Reaching L4 requires confirming the L0
// anchor with the Go verifier (`infrix verify --l0 …`); this package never
// inflates an offline verdict to L4.

import { verifyPortablePackage } from './vendor/portableVerifier.js';
import { buildReceiptFromVerifier, validateReceipt, renderReceiptText } from './vendor/proofReceipt.js';
import { mountProofReceipt, buildProofReceiptCard } from './vendor/proofReceiptView.js';

/**
 * verifyProof verifies a portable evidence package offline and returns a
 * canonical proof receipt. Pass `{ l0 }` to label which network an L4
 * confirmation would target; the offline verdict is never inflated to L4.
 *
 * @param {object} bundle parsed portable evidence package
 * @param {{ l0?: string }} [options]
 * @returns {Promise<import('./index.js').ProofReceipt>}
 */
export async function verifyProof(bundle, options = {}) {
  if (!bundle || typeof bundle !== 'object') {
    throw new TypeError('verifyProof: bundle must be a parsed portable evidence package object');
  }
  const result = await verifyPortablePackage(bundle);

  const opts = {
    evidenceId: typeof bundle.bundleId === 'string' ? bundle.bundleId : undefined,
    verifier: '@infrix/proof-receipt (offline)',
    command: 'infrix verify <bundle>.infrix.json',
  };
  if (options.l0) {
    opts.network = String(options.l0);
    opts.command = `infrix verify <bundle>.infrix.json --l0 ${options.l0}`;
  }

  const receipt = buildReceiptFromVerifier(result, opts);

  // Clear offline vs live labeling: if the caller asked about L0 but the
  // offline verdict cannot confirm it, say so plainly.
  if (options.l0 && !receipt.assurance.l0Verified) {
    receipt.warnings = receipt.warnings || [];
    receipt.warnings.push(`offline verification only — run \`${opts.command}\` to confirm the L0 anchor (L4)`);
  }
  return receipt;
}

/**
 * renderReceipt mounts the canonical proof-receipt card into a DOM element.
 * Browser-only (requires a document). Raw hashes live in an expandable section.
 *
 * @param {import('./index.js').ProofReceipt} receipt
 * @param {HTMLElement} element
 * @param {{ expanded?: boolean }} [options]
 * @returns {HTMLElement}
 */
export function renderReceipt(receipt, element, options = {}) {
  if (!element) throw new TypeError('renderReceipt: a target element is required');
  return mountProofReceipt(element, receipt, options);
}

export { validateReceipt, renderReceiptText, buildProofReceiptCard };
