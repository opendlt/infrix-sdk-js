// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import { SubClient } from './base';

/** Canonical Infrix DID method (DX P1-1). */
export const DID_METHOD_INFRIX = 'infrix';

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
    if (!trimmed) throw new Error('createDID: an Accumulate ADI (e.g. "acc://alice.acme") is required');
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
      throw new Error('presentationRequest: disclose must reveal at least one claim');
    }
    return {
      credential: params.credential,
      disclosedClaims: params.disclose,
      ...(params.challenge ? { challenge: params.challenge } : {}),
      ...(params.domain ? { domain: params.domain } : {}),
    };
  }
}
