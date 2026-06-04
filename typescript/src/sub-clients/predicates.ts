import { SubClient } from './base';

/**
 * One entry in the ZK predicate catalog — the product surface of
 * identity-based selective-disclosure assertions exposed by the Infrix
 * node (direction-hardening #3c).
 */
export interface PredicateCatalogEntry {
  /** Stable predicate name, e.g. "solvency" or "set_membership". */
  id: string;
  /** Underlying gnark circuit name (e.g. "set_membership_8"). */
  circuitName: string;
  title: string;
  description: string;
  /** Number of public inputs the circuit consumes. */
  publicArity: number;
  /** Number of private witness values. */
  privateArity: number;
  publicNames: string[];
  privateNames: string[];
  useCases: string[];
  /** Membership set size, or omitted/0 for fixed-shape predicates. */
  setSize?: number;
}

/** Response of GET /v4/predicates/catalog. */
export interface PredicateCatalog {
  curve: string;
  predicates: PredicateCatalogEntry[];
  count: number;
}

/**
 * A self-contained predicate-proof envelope. It is produced
 * data-owner-side by the native prover (Go `pkg/zkp/predicate` or a
 * future WASM build) — the private witness never leaves the holder.
 * This SDK submits the envelope for verification; it does not generate
 * Groth16 proofs in TypeScript.
 *
 * Byte fields (`proof`, `vkHash`, `holderPubKey`, `challenge`,
 * `nullifier`, `binding`) are base64-encoded on the wire (Go
 * `json.Marshal([]byte)`), so JSON round-trips faithfully.
 */
export interface PredicateProofEnvelope {
  version: number;
  predicate: string;
  circuitName: string;
  curve: string;
  publicInputs: string[];
  proof: string;
  vkHash: string;
  holderDid: string;
  holderPubKey: string;
  grantId?: string;
  purpose?: string;
  domain?: string;
  challenge?: string;
  issuedAtBlock?: number;
  nullifier: string;
  binding: string;
}

/** Result of POST /v4/predicates/verify. */
export interface PredicateVerifyResult {
  valid: boolean;
  predicate?: string;
  circuitName?: string;
  holderDid?: string;
  grantId?: string;
  purpose?: string;
  /** Replay tag (hex). A consumer that spends the proof records this. */
  nullifier?: string;
  /** Rejection reason when valid is false. */
  reason?: string;
}

/**
 * PredicateSubClient exposes the ZK predicate catalog and read-only
 * proof verification.
 *
 * Proving is native/data-owner-side: a holder runs the Go or WASM
 * prover locally and submits only the resulting envelope. This client
 * lists the available predicates and verifies submitted proofs; it
 * never sees a private witness.
 */
export class PredicateSubClient extends SubClient {
  /** List the ZK predicate catalog (product surface). */
  async catalog(): Promise<PredicateCatalog> {
    return this.rest<PredicateCatalog>('GET', '/v4/predicates/catalog');
  }

  /**
   * Verify a client-side-produced predicate proof. Read-only — does NOT
   * spend the proof's nullifier (replay/spend happens when the proof is
   * consumed by an intent).
   */
  async verify(envelope: PredicateProofEnvelope): Promise<PredicateVerifyResult> {
    return this.rest<PredicateVerifyResult>('POST', '/v4/predicates/verify', envelope);
  }
}
