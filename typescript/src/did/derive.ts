// THE DOCUMENT DERIVATION of did:infrix statements (infrix core part 25g, row H3: core's DIDUpdater.applyOperations and pkg/did/update.go, rule for rule; the Go second implementation is
// infrix-verify's didchain/derive.go, whose header states every rule). Each later version's document is re-derived by applying its statement's stored operations, in order, to the
// previous document, and its canonical hash must be the hash the entry binds. The model's member rules: the six list members (controller and the five relationships) are one string for
// one member, an array for more, omitted when empty; alsoKnownAs, verificationMethod and service are arrays omitted when empty; a method or service is inserted in the model's form (an
// empty optional member omitted). Every version's document is also held to the document rules (validate.ts), as core holds it.

import { JValue } from './canonicalJson';
import { verifyStoredBinding } from './aliasBinding';

export class DerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DerivationError';
  }
}
const refuse = (m: string): never => { throw new DerivationError(m); };

type Obj = Map<string, JValue>;
const RELATIONSHIPS = ['authentication', 'assertionMethod', 'keyAgreement', 'capabilityInvocation', 'capabilityDelegation'];

const isObj = (v: JValue | undefined): v is { obj: Obj } => v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) && 'obj' in v;
const isNum = (v: JValue | undefined): v is { num: string } => v !== null && v !== undefined && typeof v === 'object' && !Array.isArray(v) && 'num' in v;

function list(doc: Obj, name: string): string[] {
  const v = doc.get(name);
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') return [v];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return refuse(`the member ${name} is neither a string nor an array of strings`);
}
function setList(doc: Obj, name: string, values: string[], stringForOne: boolean): void {
  if (values.length === 0) doc.delete(name);
  else if (values.length === 1 && stringForOne) doc.set(name, values[0]);
  else doc.set(name, [...values]);
}
function objects(doc: Obj, name: string): Obj[] {
  const v = doc.get(name);
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every(isObj)) return refuse(`the member ${name} is not an array of objects`);
  return (v as { obj: Obj }[]).map((o) => o.obj);
}
function setObjects(doc: Obj, name: string, values: Obj[]): void {
  if (values.length === 0) doc.delete(name);
  else doc.set(name, values.map((obj) => ({ obj })));
}

const MAX_UNSIGNED = 18446744073709549568; // the largest double below 2^64
const MIN_SIGNED = -9223372036854775808;
const MAX_SIGNED = 9223372036854774784; // the largest double below 2^63

function integral(v: JValue, name: string, min: number, max: number): number {
  if (!isNum(v)) return refuse(`the member ${name} is not a number`);
  const n = Number(v.num);
  if (!Number.isInteger(n) || n < min || n > max) refuse(`the member ${name} is not an integer in its range: ${v.num}`);
  return n;
}

type Kind = 'string' | 'required' | 'unsigned' | 'signed' | 'strings' | 'any' | 'jwk';
export const PROOF_MEMBERS: Record<string, Kind> = { type: 'required', created: 'required', verificationMethod: 'required', proofPurpose: 'required', proofValue: 'string', jws: 'string', challenge: 'string' };
const VM: Record<string, Kind> = { id: 'required', type: 'required', controller: 'required', keyPageUrl: 'string', keyBookUrl: 'string', threshold: 'unsigned', pageIndex: 'unsigned', publicKeyMultibase: 'string', publicKeyJwk: 'jwk', blockchainAccountId: 'string' };
const SERVICE: Record<string, Kind> = { id: 'required', type: 'required', serviceEndpoint: 'any', routingKeys: 'strings', accept: 'strings', description: 'string', priority: 'signed' };
const JWK: Record<string, Kind> = { kty: 'required', crv: 'string', x: 'string', y: 'string', n: 'string', e: 'string', kid: 'string', alg: 'string', use: 'string' };

/** An object in its model's form: each member of its kind, an empty optional member omitted, a required string kept (empty when absent). */
function modelForm(raw: JValue | undefined, members: Record<string, Kind>, what: string): Obj {
  return modelFormOf(raw, members, what, true);
}

/** modelForm; strict reads an integer member only as an integer literal (as the model decodes JSON), not strict as a double that is an integer (as an update value is read). */
export function modelFormOf(raw: JValue | undefined, members: Record<string, Kind>, what: string, strict: boolean): Obj {
  if (!isObj(raw)) return refuse(`${what} is not an object`);
  const out: Obj = new Map();
  for (const [name, value] of raw.obj) {
    const kind = members[name];
    if (!kind) refuse(`${what} carries the member ${JSON.stringify(name)}, which it does not define`);
    if (value === null && kind !== 'any') continue;
    switch (kind) {
      case 'string':
      case 'required':
        if (typeof value !== 'string') refuse(`${what}.${name} is not a string`);
        if (value !== '' || kind === 'required') out.set(name, value);
        break;
      case 'unsigned':
      case 'signed': {
        if (strict && isNum(value) && /[.eE]/.test(value.num)) refuse(`${what}.${name} is not an integer literal: ${value.num}`);
        const n = kind === 'unsigned' ? integral(value, `${what}.${name}`, 0, MAX_UNSIGNED) : integral(value, `${what}.${name}`, MIN_SIGNED, MAX_SIGNED);
        if (n !== 0) out.set(name, { num: BigInt(n).toString() });
        break;
      }
      case 'strings':
        if (!Array.isArray(value) || !value.every((x) => typeof x === 'string')) refuse(`${what}.${name} is not an array of strings`);
        if ((value as string[]).length > 0) out.set(name, value);
        break;
      case 'jwk':
        out.set(name, { obj: modelFormOf(value, JWK, `${what}.${name}`, strict) });
        break;
      case 'any':
        out.set(name, value);
    }
  }
  for (const [name, kind] of Object.entries(members)) {
    if (!out.has(name) && kind === 'required') out.set(name, '');
    if (!out.has(name) && name === 'serviceEndpoint') out.set(name, null);
  }
  return out;
}

const OPERATIONS: Record<string, Record<string, 'string' | 'object' | 'strings'>> = {
  addVerificationMethod: { verificationMethod: 'object', relationships: 'strings' },
  removeVerificationMethod: { verificationMethodId: 'string' },
  updateVerificationMethod: { verificationMethodId: 'string', updates: 'object' },
  addService: { service: 'object' },
  removeService: { serviceId: 'string' },
  updateService: { serviceId: 'string', updates: 'object' },
  addController: { controllerDid: 'string' },
  removeController: { controllerDid: 'string' },
  addAlsoKnownAs: { identifier: 'string', binding: 'object', foreign: 'object' },
  removeAlsoKnownAs: { identifier: 'string' },
  addRelationship: { relationship: 'string', verificationMethodId: 'string' },
  removeRelationship: { relationship: 'string', verificationMethodId: 'string' },
  deactivate: { reactivationCommitment: 'string' },
  reactivate: { reactivationKey: 'string', reactivationProof: 'string' },
};
const BINDING_MEMBERS = ['infrixDid', 'foreignDid', 'nonce', 'infrixKeyId', 'infrixProofValue', 'foreignKeyId', 'foreignProofValue', 'foreignSigner'];

/** Apply one stored operation (its type and members) to a document, in place. */
export function applyOperation(doc: Obj, type: string, members: Map<string, JValue>): void {
  const defined = OPERATIONS[type];
  if (!defined) refuse(`${JSON.stringify(type)} is not an operation of the method`);
  const m = new Map<string, JValue>();
  for (const [name, value] of members) {
    if (name === 'type') continue;
    const kind = defined[name];
    if (!kind) refuse(`the member ${JSON.stringify(name)} is not one the operation defines`);
    if (value === null) continue;
    if (kind === 'string' && typeof value !== 'string') refuse(`the member ${name} is not a string`);
    if (kind === 'object' && !isObj(value)) refuse(`the member ${name} is not an object`);
    if (kind === 'strings' && !(Array.isArray(value) && value.every((x) => typeof x === 'string'))) refuse(`the member ${name} is not an array of strings`);
    m.set(name, value);
  }
  const str = (name: string): string => {
    const v = m.get(name);
    if (typeof v !== 'string' || v === '') return refuse(`the member ${name} is required`);
    return v;
  };
  switch (type) {
    case 'addVerificationMethod': {
      const vm = modelForm(m.get('verificationMethod'), VM, 'verificationMethod');
      const id = vm.get('id') as string;
      if (id === '' || vm.get('type') === '' || vm.get('controller') === '') refuse("the verification method's id, type and controller are required");
      const rels = (m.get('relationships') as string[] | undefined) ?? [];
      for (const r of rels) if (!RELATIONSHIPS.includes(r)) refuse(`unknown relationship type: ${r}`);
      const methods = objects(doc, 'verificationMethod');
      if (methods.some((x) => x.get('id') === id)) refuse(`verification method already exists: ${id}`);
      setObjects(doc, 'verificationMethod', [...methods, vm]);
      for (const r of rels) setList(doc, r, [...list(doc, r), id], true);
      return;
    }
    case 'removeVerificationMethod': {
      const id = str('verificationMethodId');
      const methods = objects(doc, 'verificationMethod');
      const kept = methods.filter((x) => x.get('id') !== id);
      if (kept.length === methods.length) refuse(`verification method not found: ${id}`);
      setObjects(doc, 'verificationMethod', kept);
      for (const r of RELATIONSHIPS) setList(doc, r, list(doc, r).filter((x) => x !== id), true);
      return;
    }
    case 'updateVerificationMethod':
    case 'updateService': {
      const service = type === 'updateService';
      const id = str(service ? 'serviceId' : 'verificationMethodId');
      const allowed = service ? ['type', 'description', 'priority', 'serviceEndpoint'] : ['controller', 'keyPageUrl', 'keyBookUrl', 'threshold'];
      const updates = m.get('updates');
      if (!isObj(updates) || updates.obj.size === 0) return refuse('no updates specified');
      for (const [name, value] of updates.obj) {
        if (!allowed.includes(name)) refuse(`the update member ${JSON.stringify(name)} is not one this operation applies`);
        if (value === null && name !== 'serviceEndpoint') refuse(`the update member ${JSON.stringify(name)} is null`);
      }
      const listName = service ? 'service' : 'verificationMethod';
      const items = objects(doc, listName);
      const target = items.find((x) => x.get('id') === id);
      for (const [name, value] of updates.obj) {
        if (name === 'serviceEndpoint' && value === null) continue;
        const single = modelFormOf({ obj: new Map([[name, value]]) }, service ? SERVICE : VM, 'updates', false);
        if (!target) continue;
        const v = single.get(name);
        if (v !== undefined && (name !== 'type' || v !== '')) target.set(name, v);
        else if (name === 'type') target.set(name, '');
        else target.delete(name);
      }
      if (!target) refuse(`${service ? 'service' : 'verification method'} not found: ${id}`);
      // the items are the document's own objects (objects returns them, not copies), so each update above is in the document already (part 25i)
      // restored from part 25i (EQUIVALENT in the cut tables: setObjects writes back the same objects the document holds, so the document is the same with or without it)
      setObjects(doc, listName, items);
      return;
    }
    case 'addService': {
      const svc = modelForm(m.get('service'), SERVICE, 'service');
      if (svc.get('id') === '' || svc.get('type') === '' || svc.get('serviceEndpoint') === null) refuse("the service's id, type and endpoint are required");
      const services = objects(doc, 'service');
      if (services.some((x) => x.get('id') === svc.get('id'))) refuse(`service already exists: ${svc.get('id')}`);
      setObjects(doc, 'service', [...services, svc]);
      return;
    }
    case 'removeService': {
      const id = str('serviceId');
      const services = objects(doc, 'service');
      const kept = services.filter((x) => x.get('id') !== id);
      if (kept.length === services.length) refuse(`service not found: ${id}`);
      setObjects(doc, 'service', kept);
      return;
    }
    case 'addController':
    case 'removeController': {
      const did = str('controllerDid');
      const controllers = list(doc, 'controller');
      if (type === 'addController') {
        if (controllers.includes(did)) refuse(`controller already exists: ${did}`);
        setList(doc, 'controller', [...controllers, did], true);
        return;
      }
      if (!controllers.includes(did)) refuse(`controller not found: ${did}`);
      const kept = controllers.filter((x) => x !== did);
      if (kept.length === 0) refuse('cannot remove last controller');
      setList(doc, 'controller', kept, true);
      return;
    }
    case 'addAlsoKnownAs':
    case 'removeAlsoKnownAs': {
      const foreign = m.get('foreign');
      if (isObj(foreign) && foreign.obj.size !== 0) refuse('the member "foreign" carries members the model does not define');
      const binding = m.get('binding');
      if (isObj(binding)) for (const name of binding.obj.keys()) if (!BINDING_MEMBERS.includes(name)) refuse(`the binding carries the member ${JSON.stringify(name)}, which it does not define`);
      const identifier = str('identifier');
      const aliases = list(doc, 'alsoKnownAs');
      if (type === 'addAlsoKnownAs') {
        if (aliases.includes(identifier)) refuse(`alsoKnownAs already exists: ${identifier}`);
        if (identifier.startsWith('did:')) {
          const method = identifier.slice(4).split(':')[0];
          if (method !== 'infrix' && method !== 'lattica') verifyStoredBinding(isObj(binding) ? binding.obj : undefined, identifier, doc, refuse);
        }
        setList(doc, 'alsoKnownAs', [...aliases, identifier], false);
        return;
      }
      if (!aliases.includes(identifier)) refuse(`alsoKnownAs not found: ${identifier}`);
      setList(doc, 'alsoKnownAs', aliases.filter((x) => x !== identifier), false);
      return;
    }
    case 'addRelationship':
    case 'removeRelationship': {
      const rel = str('relationship');
      const id = str('verificationMethodId');
      if (type === 'addRelationship' && !objects(doc, 'verificationMethod').some((x) => x.get('id') === id)) refuse(`verification method not found: ${id}`);
      if (!RELATIONSHIPS.includes(rel)) refuse(`unknown relationship type: ${rel}`);
      const values = list(doc, rel);
      if (type === 'addRelationship') {
        if (!values.includes(id)) setList(doc, rel, [...values, id], true);
        return;
      }
      setList(doc, rel, values.filter((x) => x !== id), true);
      return;
    }
  }
}

/** Deep-copy a parsed value, so a derivation never changes the document it starts from. */
export function cloneValue(v: JValue): JValue {
  if (Array.isArray(v)) return v.map(cloneValue);
  if (isObj(v)) return { obj: new Map([...v.obj].map(([k, x]) => [k, cloneValue(x)])) };
  return v;
}

/** Derive the document stored operations yield from a parsed document. */
export function deriveDocument(document: JValue, operations: { type: string; members: Map<string, JValue> }[]): JValue {
  const copy = cloneValue(document);
  if (!isObj(copy)) return refuse('the document is not an object');
  operations.forEach((op, i) => {
    try {
      applyOperation(copy.obj, op.type, op.members);
    } catch (err) {
      throw new DerivationError(`operation ${i} (${op.type}): ${(err as Error).message}`);
    }
  });
  return copy;
}

export const VM_MEMBERS = VM;
export const SERVICE_MEMBERS = SERVICE;
