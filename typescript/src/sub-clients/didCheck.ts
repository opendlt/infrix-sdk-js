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

/**
 * DIDCheckSubClient asks the node for the verdict of one did:infrix rule. Read-only: the route applies a pure function of the request and
 * writes nothing (docs/convergence/no-effect-routes.txt lists it `proven`). Registering a DID or migrating its storage are governed intents,
 * not checks. To resolve a DID use the generated `routes` client (GET /v4/did/{did}).
 */
export class DIDCheckSubClient extends SubClient {
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
