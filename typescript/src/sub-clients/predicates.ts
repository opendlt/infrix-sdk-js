import { SubClient } from './base';
import { InfrixUserError } from '../userError';

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
/**
 * Client-side proving input. Big integers accept bigint | number | string;
 * keys/nonces are Uint8Array. Mirrors the @infrix/prover request shape.
 */
export interface PredicateProveRequest {
  predicate: string;
  setSize?: number;
  publicInputs: Array<bigint | number | string>;
  privateInputs: Array<bigint | number | string>;
  holderSigner: Uint8Array;
  holderDID?: string;
  nullifierKey?: Uint8Array;
  grantId?: string;
  purpose?: string;
  domain?: string;
  challenge?: Uint8Array;
  issuedAtBlock?: number;
}

/**
 * A prover handle — the object returned by `loadProver()` from the optional
 * `@infrix/prover` package. Injected into `PredicateSubClient.prove` so the
 * heavy (~16 MB) WASM prover is never bundled into `@infrix/client`.
 */
export interface PredicateProver {
  prove(request: PredicateProveRequest): Promise<PredicateProofEnvelope>;
}

export class PredicateSubClient extends SubClient {
  /** List the ZK predicate catalog (product surface). */
  async catalog(): Promise<PredicateCatalog> {
    return this.rest<PredicateCatalog>('GET', '/v4/predicates/catalog');
  }

  /**
   * Generate a selective-disclosure proof client-side, then it can be submitted
   * to {@link verify}. Proof generation runs in the optional `@infrix/prover`
   * WASM module (not bundled here), so pass a loaded prover:
   *
   * ```ts
   * import { loadProver } from '@infrix/prover';
   * const prover = await loadProver();
   * const envelope = await client.predicates.prove({ predicate: 'threshold_gte',
   *   publicInputs: [18n], privateInputs: [21n], holderSigner }, prover);
   * await client.predicates.verify(envelope);
   * ```
   *
   * The private witness never leaves the prover; only the public envelope is
   * returned. Without a prover this throws a typed PROVER_NOT_INSTALLED error
   * (with the install remedy) rather than failing opaquely.
   */
  async prove(request: PredicateProveRequest, prover?: PredicateProver): Promise<PredicateProofEnvelope> {
    if (!prover) {
      throw new InfrixUserError({
        code: 'PROVER_NOT_INSTALLED',
        title: 'Predicate prover not available',
        message:
          'Selective-disclosure proof generation runs client-side in @infrix/prover, which is not bundled with @infrix/client.',
        impact: 'Without the WASM prover this SDK can verify predicate proofs but cannot generate them.',
        fixes: [
          {
            label: 'Install the prover and pass it',
            command: 'npm i @infrix/prover   # then: const p = await loadProver(); client.predicates.prove(req, p)',
            safeToRun: true,
          },
        ],
        retryable: false,
      });
    }
    return prover.prove(request);
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
