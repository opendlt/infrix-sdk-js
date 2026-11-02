import { SubClient } from './base';

/**
 * The checks the node serves at POST /v4/did/check (docs/release/census/did-checks.txt in the node repository). Each is one rule of the
 * did:infrix method that the `infrix did ...` commands also apply, so a verdict from the node and from the binary come from one function.
 */
export type DIDCheckName =
  | 'inspect'
  | 'acc'
  | 'chain'
  | 'anon-mint'
  | 'anon-rotation'
  | 'adapter-admission'
  | 'alias-binding'
  | 'alias-relationship'
  | 'storage-history'
  | 'method-spec'
  | 'vectors'
  | 'credential-model'
  | 'hosted-context'
  | 'integrity'
  | 'bbs'
  | 'bbs-issue'
  | 'bbs-derive'
  | 'vocab'
  | 'did-document'
  | 'w3c-vector';

/** The request of POST /v4/did/check: the check and the inputs of its rule. */
export interface DIDCheckRequest {
  check: DIDCheckName;
  did?: string;
  networkId?: string;
  account?: string;
  namespace?: string;
  reference?: string;
  subject?: string;
  equivalentId?: string[];
  canonicalId?: string;
  term?: string;
  scenario?: string;
  /** bbs-issue: `derived` (issuer signs, holder derives) or `base`. */
  stage?: string;
  /** bbs-derive: the JSON pointers of the further statements to disclose. */
  select?: string[];
  /** bbs-derive: the holder's presentation header, hex. */
  presentationHeader?: string;
  purpose?: string;
  challenge?: string;
  domain?: string;
  /** The EXACT bytes of the file the rule reads, base64-encoded (Go `json.Marshal([]byte)`). */
  artifact?: string;
}

/** The verdict of POST /v4/did/check. A refusal is a clean answer (verified=false, the typed reason and its text), not an error. */
export interface DIDCheckResult {
  check: string;
  verified: boolean;
  /** The typed refusal reason, present when verified is false. */
  reason?: string;
  error?: string;
  /** The members the rule states about its input (the same ones the binary prints). */
  fields?: Record<string, unknown>;
}

// BEGIN w3c-identity-terms: generated from docs/release/census/w3c-identity-surface.txt in the node repository by scripts/gen-w3c-terms-ts.py; do not edit by hand.
export type W3CTermDisposition = 'OK' | 'SUPERSEDED' | 'DANGLING' | 'PRIVATE' | 'INVALID';

/** Every string Infrix emits or requires on a DID, credential or presentation, with its standards disposition. */
export const W3C_IDENTITY_TERMS = {
  'did:infrix': 'INVALID',
  'did:lattica': 'SUPERSEDED',
  'https://www.w3.org/ns/did/v1': 'OK',
  'https://lattica.io/ns/did/v1': 'DANGLING',
  'https://infrix.opendlt.org/ns/did/v1': 'DANGLING',
  'https://infrix.opendlt.org/ns/credentials/v1': 'DANGLING',
  'https://www.w3.org/2018/credentials/v1': 'OK',
  'https://w3id.org/security/bbs/v1': 'SUPERSEDED',
  'https://w3id.org/security/data-integrity/v2': 'OK',
  'https://www.w3.org/ns/credentials/v2': 'OK',
  'https://w3id.org/vc/status-list/2021/v1': 'OK',
  'https://www.w3.org/ns/credentials/examples/v2': 'OK',
  'https://w3id.org/security/suites/ed25519-2020/v1': 'OK',
  'Ed25519VerificationKey2020': 'OK',
  'EcdsaSecp256k1VerificationKey2019': 'OK',
  'Multikey': 'OK',
  'AccumulateKeyPage': 'PRIVATE',
  'keyPageUrl': 'PRIVATE',
  'keyBookUrl': 'PRIVATE',
  'pageIndex': 'PRIVATE',
  'threshold': 'PRIVATE',
  'DIDCommMessaging': 'OK',
  'CredentialRegistry': 'PRIVATE',
  'LinkedData': 'PRIVATE',
  'InfrixContract': 'PRIVATE',
  'InfrixAPI': 'PRIVATE',
  'description': 'PRIVATE',
  'infrix://': 'PRIVATE',
  'Ed25519Signature2020': 'OK',
  'Ed25519Signature2018': 'OK',
  'Ed25519VerificationKey2018': 'OK',
  'https://w3id.org/security/suites/ed25519-2018/v1': 'OK',
  'BbsBlsSignature2020': 'SUPERSEDED',
  'BbsBlsSignatureProof2020': 'SUPERSEDED',
  'AccumulateKeyPageProof': 'PRIVATE',
  'DataIntegrityProof': 'OK',
  'StatusList2021Entry': 'OK',
  'notFound': 'OK',
  'invalidDid': 'OK',
  'representationNotSupported': 'OK',
} as const satisfies Record<string, W3CTermDisposition>;

export type W3CIdentityTerm = keyof typeof W3C_IDENTITY_TERMS;
// END w3c-identity-terms

/**
 * DIDCheckSubClient asks the node for the verdict of one did:infrix rule. Read-only: the route applies a pure function of the request and
 * writes nothing (docs/convergence/no-effect-routes.txt lists it `proven`). Registering a DID or migrating its storage are governed intents,
 * not checks. To resolve a DID use the generated `routes` client (GET /v4/did/{did}).
 */
export class DIDCheckSubClient extends SubClient {
  /**
   * What Infrix makes of a string it emits or requires on a DID, credential or presentation (the node's identity-surface census): `OK` is
   * conformant as emitted, `PRIVATE` is an Infrix extension, `DANGLING` a URL emitted but not hosted, `SUPERSEDED` a standards term replaced by a
   * newer one, `INVALID` a violation of the governing grammar. `undefined` means Infrix names no such term. Offline: it asks no node. To have
   * the node judge a term in a scenario, call `check({ check: 'vocab', term })`.
   */
  termDisposition(term: string): W3CTermDisposition | undefined {
    return Object.prototype.hasOwnProperty.call(W3C_IDENTITY_TERMS, term) ? W3C_IDENTITY_TERMS[term as W3CIdentityTerm] : undefined;
  }


  /** Apply one rule to the input in the request and return the node's verdict. */
  async check(request: DIDCheckRequest): Promise<DIDCheckResult> {
    const body = {
      check: request.check,
      did: request.did,
      networkId: request.networkId,
      account: request.account,
      namespace: request.namespace,
      reference: request.reference,
      subject: request.subject,
      equivalentId: request.equivalentId,
      canonicalId: request.canonicalId,
      term: request.term,
      scenario: request.scenario,
      stage: request.stage,
      select: request.select,
      presentationHeader: request.presentationHeader,
      purpose: request.purpose,
      challenge: request.challenge,
      domain: request.domain,
      artifact: request.artifact,
    };
    const result = await this.rest<DIDCheckResult>('POST', '/v4/did/check', body);
    return { check: result.check, verified: result.verified, reason: result.reason, error: result.error, fields: result.fields };
  }
}
