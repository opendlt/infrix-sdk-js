// THE DOCUMENT RULES every version of an anon or chain history meets (infrix core part 25g: CheckRegistryDocument, ContractDIDDocument.Validate and the updater's limits, rule for
// rule; infrix-verify's didchain/validate.go states each rule; the shared vectors' documentValidity section pins each). The model and its form, the W3C DID context, each verification
// method's id/type/controller and registered key form, each service's id/type/endpoint and the DIDCommMessaging form, and the limits (100 methods, 50 services, 10 controllers).

import { secp256k1 } from '@noble/curves/secp256k1';
import { JValue, parseJSON, writeCanonical } from './canonicalJson';
import { base58Decode } from './accounts';
import { modelFormOf, VM_MEMBERS, SERVICE_MEMBERS, PROOF_MEMBERS } from './derive';

export class DocumentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentRuleError';
  }
}
const refuse = (m: string): never => { throw new DocumentRuleError(m); };

type Obj = Map<string, JValue>;
const isObj = (v: JValue | undefined): v is { obj: Obj } => v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) && 'obj' in v;
const LISTS = ['controller', 'authentication', 'assertionMethod', 'keyAgreement', 'capabilityInvocation', 'capabilityDelegation'];
const MODEL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d*[1-9])?(Z|[+-]\d{2}:\d{2})$/;

function strings(v: JValue, what: string): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return refuse(`${what} is neither a string nor an array of strings`);
}

/** The document's model encoding, refusing a member the model does not define or of another kind. */
function modelDocument(doc: JValue): Obj {
  if (!isObj(doc)) return refuse('the document is not an object');
  const out: Obj = new Map();
  for (const [name, v] of doc.obj) {
    if (name === '@context') {
      if (v !== null && !(Array.isArray(v) && v.every((x) => typeof x === 'string'))) refuse('@context is not an array of strings');
      out.set(name, v);
    } else if (name === 'id') {
      if (v !== null && typeof v !== 'string') refuse('id is not a string');
      if (v !== null) out.set(name, v);
    } else if (LISTS.includes(name)) {
      if (v === null) continue;
      const values = strings(v, name);
      if (values.length === 1) out.set(name, values[0]);
      else if (values.length > 1) out.set(name, values);
    } else if (name === 'alsoKnownAs') {
      if (v === null) continue;
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) refuse('alsoKnownAs is not an array of strings');
      if ((v as string[]).length > 0) out.set(name, v);
    } else if (name === 'verificationMethod' || name === 'service') {
      if (v === null) continue;
      if (!Array.isArray(v)) refuse(`${name} is not an array`);
      const forms = (v as JValue[]).map((item, i) => ({ obj: modelFormOf(item, name === 'service' ? SERVICE_MEMBERS : VM_MEMBERS, `${name} ${i}`, true) }));
      if (forms.length > 0) out.set(name, forms);
    } else if (name === 'proof') {
      if (v === null) continue;
      const form = modelFormOf(v, PROOF_MEMBERS, 'proof', true);
      const created = form.get('created') as string;
      if (!MODEL_TIME.test(created) || /[+-]00:00$/.test(created) || Number.isNaN(Date.parse(created))) refuse(`the proof's time ${created} is not in the model's RFC 3339 form`);
      out.set(name, { obj: form });
    } else {
      refuse(`the document carries the member ${JSON.stringify(name)}, which the model does not define`);
    }
  }
  if (!out.has('@context')) out.set('@context', null);
  if (!out.has('id')) out.set('id', '');
  return out;
}

function b64urlRaw(s: unknown): Uint8Array | null {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

function didcommURI(uri: string): boolean {
  const i = uri.indexOf('://');
  if (i < 0 || !['http', 'https', 'ws', 'wss'].includes(uri.slice(0, i).toLowerCase()) || /[\u0000- \u007f]/.test(uri)) return false;
  let authority = uri.slice(i + 3);
  const end = authority.search(/[/?#]/);
  if (end >= 0) authority = authority.slice(0, end);
  authority = authority.slice(authority.lastIndexOf('@') + 1);
  let host = authority;
  const colon = host.lastIndexOf(':');
  if (colon >= 0 && !host.endsWith(']')) host = host.slice(0, colon);
  return host !== '';
}

/** Hold a parsed document to the rules every version of an anon or chain history meets. */
export function checkDocument(document: JValue): void {
  const stored = writeCanonical(document);
  const doc = modelDocument(document);
  if (writeCanonical({ obj: doc }) !== stored) refuse("the document is not in its model's form");
  if (doc.get('id') === '') refuse('missing DID ID');
  const contexts = doc.get('@context');
  if (!Array.isArray(contexts) || !contexts.includes('https://www.w3.org/ns/did/v1')) refuse('missing W3C DID context');
  const methods = ((doc.get('verificationMethod') as JValue[] | undefined) ?? []).map((m) => (m as { obj: Obj }).obj);
  methods.forEach((vm, i) => {
    const id = vm.get('id');
    const type = vm.get('type');
    if (id === '') refuse(`verification method ${i} missing ID`);
    if (type === '') refuse(`verification method ${i} missing type`);
    if (vm.get('controller') === '') refuse(`verification method ${i} missing controller`);
    const multibase = vm.get('publicKeyMultibase');
    const jwk = vm.get('publicKeyJwk');
    if (type === 'AccumulateKeyPage' && !vm.get('keyPageUrl')) refuse(`verification method ${i} missing keyPageUrl`);
    if (type === 'Multikey' || type === 'Ed25519VerificationKey2020') {
      if (jwk !== undefined) refuse(`${type} ${id} carries publicKeyJwk`);
      const raw = typeof multibase === 'string' && multibase.startsWith('z') ? base58Decode(multibase.slice(1)) : null;
      if (!raw || raw.length !== 34 || raw[0] !== 0xed || raw[1] !== 0x01) refuse(`${type} ${id} is not an ed25519 Multikey`);
    }
    if (type === 'EcdsaSecp256k1VerificationKey2019') {
      if (multibase !== undefined) refuse(`${type} ${id} carries publicKeyMultibase`);
      if (!isObj(jwk)) return refuse(`${type} ${id} carries no publicKeyJwk`);
      if (jwk.obj.get('kty') !== 'EC' || jwk.obj.get('crv') !== 'secp256k1') refuse(`${type} ${id}: publicKeyJwk is not kty EC crv secp256k1`);
      const x = b64urlRaw(jwk.obj.get('x'));
      const y = b64urlRaw(jwk.obj.get('y'));
      if (!x || !y || x.length !== 32 || y.length !== 32) refuse(`${type} ${id}: publicKeyJwk x and y must be 32-byte base64url values`);
      try {
        secp256k1.ProjectivePoint.fromHex(Uint8Array.from([4, ...x!, ...y!]));
      } catch {
        refuse(`${type} ${id}: publicKeyJwk is not a point on secp256k1`);
      }
    }
  });
  const services = ((doc.get('service') as JValue[] | undefined) ?? []).map((s) => (s as { obj: Obj }).obj);
  services.forEach((svc, i) => {
    const id = svc.get('id');
    if (id === '') refuse(`service ${i} missing ID`);
    if (svc.get('type') === '') refuse(`service ${i} missing type`);
    const endpoint = svc.get('serviceEndpoint');
    if (endpoint === null || endpoint === undefined) refuse(`service ${i} missing serviceEndpoint`);
    if (svc.get('type') !== 'DIDCommMessaging') return;
    const routing: JValue[] = Array.isArray(svc.get('routingKeys')) ? [...(svc.get('routingKeys') as JValue[])] : [];
    let uri: JValue | undefined;
    if (typeof endpoint === 'string') uri = endpoint;
    else if (isObj(endpoint)) {
      uri = endpoint.obj.get('uri');
      if (typeof uri !== 'string' || uri === '') refuse(`service ${id}: a DIDCommMessaging endpoint object needs a uri member`);
      const keys = endpoint.obj.get('routingKeys');
      if (Array.isArray(keys)) routing.push(...keys);
    } else refuse(`service ${id}: a DIDCommMessaging endpoint is a URI or an object with a uri member`);
    if (!didcommURI(uri as string)) refuse(`service ${id}: endpoint ${uri} is not an absolute http, https, ws or wss URI`);
    for (const k of routing) if (typeof k !== 'string' || !k.startsWith('did:')) refuse(`service ${id}: routing key ${JSON.stringify(k)} is not a DID URL`);
  });
  const controllers = doc.get('controller');
  const controllerCount = controllers === undefined ? 0 : typeof controllers === 'string' ? 1 : (controllers as string[]).length;
  if (methods.length > 100) refuse(`verification method limit exceeded: ${methods.length} > 100`);
  if (services.length > 50) refuse(`service limit exceeded: ${services.length} > 50`);
  if (controllerCount > 10) refuse(`controller limit exceeded: ${controllerCount} > 10`);
}

/** checkDocument over JSON text. */
export function checkDocumentText(text: string): void {
  checkDocument(parseJSON(text));
}
