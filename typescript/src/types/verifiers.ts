/**
 * The proof verifiers the node registers, by id.
 *
 * A governed step selects a verifier by id (`VerifierID`), and the node refuses an id
 * it does not register. This is the client's declaration of that registry: the
 * production verifier set (infrix-core executor.RegisterProductionVerifiers,
 * listed in docs/release/census/verifiers.txt and held equal to the registry by
 * TestVerifierCensusMatchesTheProductionRegistry). infrix-core's
 * scripts/convergence/unitparity.py reads the region below and reports any
 * registered verifier it does not name, so a verifier added to the node without
 * being added here is a measured gap, not a silent one.
 *
 * Whether a verifier is turnkey, signature-only or needs a live substrate is the
 * node's coverage report (docs/plugins/verifier-coverage.md), not decided here.
 */

// SDKGEN-BEGIN(verifier_ids)
export const VERIFIER_IDS = [
  'bbs-bls12381',
  'bls12381-merkle-disclosure',
  'bridge-validator-quorum',
  'cosmos-adr036',
  'ed25519',
  'ethereum-ecdsa',
  'groth16-bls12-381',
  'groth16-bn254',
  'groth16-circuit-mac',
  'plonk-bls12-381',
  'plonk-bn254',
  'vc-accumulate-keypage',
  'vc-w3c-ed25519',
  'vc-w3c-ed25519-statuslist',
  'vp-bbs-selective-disclosure',
  'vp-w3c-ed25519',
] as const;
// SDKGEN-END(verifier_ids)

/** An id of a verifier the node registers. */
export type VerifierId = (typeof VERIFIER_IDS)[number];

/** Whether `id` names a verifier the node registers. */
export function isVerifierId(id: unknown): id is VerifierId {
  return typeof id === 'string' && (VERIFIER_IDS as readonly string[]).includes(id);
}
