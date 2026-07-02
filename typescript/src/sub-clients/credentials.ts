// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import { SubClient } from './base';
import type { PredicateProver, PredicateProofEnvelope } from './predicates';
import { InfrixUserError } from '../userError';

// credErr builds a typed, agent-branchable error (stable `code` + a `remedy`
// fix) instead of an opaque Error, so an agent can act on the failure without
// parsing a message (DX P4-3).
function credErr(code: string, message: string, remedy: string): InfrixUserError {
  return new InfrixUserError({
    code,
    title: message,
    message,
    fixes: [{ label: remedy, safeToRun: true }],
    retryable: false,
  });
}

/** Canonical Infrix DID method (DX P1-1). */
export const DID_METHOD_INFRIX = 'infrix';

/**
 * The explicit claim→predicate binding for {@link CredentialSubClient.present}.
 *
 * There is no magic auto-mapping from a credential's claims to a ZK circuit: the
 * developer DECLARES which predicate to prove, its public inputs, and which named
 * VC claims become the private witness (`claimInputs`). `present` then reads
 * those claims from the credential and proves — the private values never leave
 * the prover. Declaring the binding (rather than guessing it) is what makes this
 * safe (DX P1-4).
 */
export interface DisclosureSpec {
  /** Predicate to prove, e.g. 'threshold_gte'. */
  predicate: string;
  /** Membership set size, when the predicate needs it. */
  setSize?: number;
  /** Public inputs (e.g. the threshold to compare against). */
  publicInputs: Array<bigint | number | string>;
  /**
   * Names of the credential's claims to use as the PRIVATE witness, in circuit
   * order. Each must be a numeric-valued claim (bigint | number | integer
   * string) the circuit can consume.
   */
  claimInputs: string[];
  /** Holder key proving control (64-byte Go-format Ed25519). */
  holderSigner: Uint8Array;
  /** Verifier challenge / nonce, binding the proof. */
  challenge?: Uint8Array;
  grantId?: string;
  purpose?: string;
  domain?: string;
}

/** A W3C Verifiable Credential as returned by the node's credential engine. */
export interface VerifiableCredential {
  '@context'?: string[];
  id?: string;
  type?: string[];
  issuer?: string;
  credentialSubject?: Record<string, unknown>;
  proof?: Record<string, unknown>;
  [k: string]: unknown;
}

/** Parameters for {@link CredentialSubClient.issue}. */
export interface IssueCredentialParams {
  /** Subject DID, e.g. "did:infrix:acc://alice.acme". */
  subjectDID: string;
  /** Credential types, e.g. ["VerifiableCredential", "KYCCredential"]. */
  credentialTypes: string[];
  /** The claims to attest. */
  claims: Record<string, unknown>;
  /** Optional RFC3339 expiration date. */
  expirationDate?: string;
}

/** A selective-disclosure request produced by {@link CredentialSubClient.presentationRequest}. */
export interface SelectiveDisclosureRequest {
  credential: string;
  disclosedClaims: string[];
  challenge?: string;
  domain?: string;
}

/**
 * CredentialSubClient exposes DID + Verifiable Credential ergonomics.
 *
 * - `createDID` is a purely local, offline transform (a DID is a deterministic
 *   function of the Accumulate ADI) — no node required.
 * - `issue` / `issuerDocument` call the node's credential engine (`vc.*` RPC);
 *   the disclosure context (actor + purpose) is injected automatically from the
 *   client constructor (see InfrixClient) — the node rejects governed calls
 *   without it.
 * - `presentationRequest` assembles a real selective-disclosure request. Proof
 *   *generation* (BBS+ / ZK) runs in the data-owner's native prover, not in this
 *   SDK; *verification* of the resulting envelope is available today via
 *   `client.predicates.verify(...)`. End-to-end in-JS proving lands with the
 *   WASM prover (DX P1-3 follow-up / P1-4).
 */
export class CredentialSubClient extends SubClient {
  /**
   * Derive the canonical `did:infrix` for an Accumulate ADI or a wallet. This is
   * offline and deterministic — it never contacts a node.
   *
   * @example
   *   client.credentials.createDID('acc://alice.acme')
   *   // → "did:infrix:acc://alice.acme"
   */
  createDID(adiOrWallet: string | { adi: string }): string {
    const raw = typeof adiOrWallet === 'string' ? adiOrWallet : adiOrWallet.adi;
    const trimmed = (raw ?? '').trim();
    if (!trimmed)
      throw credErr('INFRIX_INVALID_ADI', 'createDID: an Accumulate ADI is required', 'Pass an ADI like "acc://alice.acme"');
    const accURL = /^acc:\/\//i.test(trimmed) ? trimmed : `acc://${trimmed}`;
    return `did:${DID_METHOD_INFRIX}:${accURL}`;
  }

  /**
   * Issue a verifiable credential to a subject DID via the node's credential
   * engine (`vc.issue`). Returns the signed credential.
   *
   * @example
   *   await client.credentials.issue({
   *     subjectDID: 'did:infrix:acc://alice.acme',
   *     credentialTypes: ['KYCCredential'],
   *     claims: { tier: '2', country: 'US' },
   *   });
   */
  async issue(params: IssueCredentialParams): Promise<VerifiableCredential> {
    return this.rpc<VerifiableCredential>('vc.issue', {
      subjectDid: params.subjectDID,
      credentialTypes: params.credentialTypes,
      claims: params.claims,
      ...(params.expirationDate ? { expirationDate: params.expirationDate } : {}),
    });
  }

  /** Fetch the node's credential-issuer DID document (`vc.didDocument`). */
  async issuerDocument(): Promise<Record<string, unknown>> {
    return this.rpc<Record<string, unknown>>('vc.didDocument', {});
  }

  /**
   * Assemble a selective-disclosure request that names the credential and the
   * exact claims to reveal, bound to an optional challenge. This is the input a
   * prover consumes; it does not itself generate a proof (see the class doc).
   */
  presentationRequest(params: {
    credential: string;
    disclose: string[];
    challenge?: string;
    domain?: string;
  }): SelectiveDisclosureRequest {
    if (!params.disclose || params.disclose.length === 0) {
      throw credErr('INFRIX_DISCLOSE_EMPTY', 'presentationRequest: disclose must reveal at least one claim', 'Pass a non-empty disclose array, e.g. ["age_over_21"]');
    }
    return {
      credential: params.credential,
      disclosedClaims: params.disclose,
      ...(params.challenge ? { challenge: params.challenge } : {}),
      ...(params.domain ? { domain: params.domain } : {}),
    };
  }

  /**
   * Selective disclosure of a verifiable credential in one call: read the
   * private witness from the credential's claims (per {@link DisclosureSpec}),
   * prove the declared predicate with the injected `@infrix/prover`, and return
   * the public proof envelope. The private claim values never leave the prover.
   *
   * The claim→circuit binding is EXPLICIT (spec.claimInputs names which claims
   * become the private inputs) — there is no fragile auto-inference from claim
   * name to circuit (DX P1-4).
   *
   * @example
   *   const envelope = await client.credentials.present(vc, {
   *     predicate: 'threshold_gte',
   *     publicInputs: [21],      // prove the age claim is >= 21
   *     claimInputs: ['age'],    // ...using the VC's `age` claim as the witness
   *     holderSigner,
   *   }, prover);
   *   await client.predicates.verify(envelope);
   */
  async present(
    vc: VerifiableCredential,
    spec: DisclosureSpec,
    prover: PredicateProver
  ): Promise<PredicateProofEnvelope> {
    if (!prover)
      throw credErr('INFRIX_PROVER_MISSING', 'present: a prover is required', 'npm i @infrix/prover; const p = await loadProver(); pass it as the third argument');
    const subject = vc.credentialSubject ?? {};
    const privateInputs = spec.claimInputs.map((name) => {
      const raw = (subject as Record<string, unknown>)[name];
      if (raw === undefined || raw === null) {
        throw credErr('INFRIX_CREDENTIAL_CLAIM_MISSING', `present: credential has no claim '${name}' to disclose`, `Add claim '${name}' to the credential, or remove it from claimInputs`);
      }
      if (typeof raw === 'bigint' || typeof raw === 'number') return raw;
      if (typeof raw === 'string' && /^-?\d+$/.test(raw)) return raw;
      throw credErr(
        'INFRIX_CREDENTIAL_CLAIM_NOT_NUMERIC',
        `present: claim '${name}' (${JSON.stringify(raw)}) is not a numeric value the circuit can consume`,
        `Ensure claim '${name}' is an integer (bigint | number | integer string)`
      );
    });
    return prover.prove({
      predicate: spec.predicate,
      setSize: spec.setSize,
      publicInputs: spec.publicInputs,
      privateInputs,
      holderSigner: spec.holderSigner,
      ...(spec.challenge ? { challenge: spec.challenge } : {}),
      ...(spec.grantId ? { grantId: spec.grantId } : {}),
      ...(spec.purpose ? { purpose: spec.purpose } : {}),
      ...(spec.domain ? { domain: spec.domain } : {}),
    });
  }
}
