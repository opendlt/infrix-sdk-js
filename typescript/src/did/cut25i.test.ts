// Part 25i, the cut of the SDK's DID derivation and canonical form: every refusal held by its own words, every document by its exact members, the parser at every
// boundary the cut found open.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalNumber, CanonicalJSONError, JValue, parseJSON, writeCanonical } from './canonicalJson';
import { deriveDocument, DerivationError } from './derive';

const DID = 'did:infrix:v1:anon:x';
type Obj = Map<string, JValue>;

function base(edit?: (d: Record<string, unknown>) => void): JValue {
  const doc: Record<string, unknown> = {
    '@context': ['https://www.w3.org/ns/did/v1'], id: DID, controller: DID,
    verificationMethod: [{ id: `${DID}#k1`, type: 'Multikey', controller: DID, publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' }],
    authentication: `${DID}#k1`,
    service: [{ id: `${DID}#s`, type: 'LinkedDomains', serviceEndpoint: 'https://a.example' }],
  };
  if (edit) edit(doc);
  return parseJSON(JSON.stringify(doc));
}

function op(text: string): { type: string; members: Map<string, JValue> } {
  const v = parseJSON(text) as { obj: Obj };
  const type = v.obj.get('type') as string;
  const members = new Map(v.obj);
  members.delete('type');
  return { type, members };
}

function derive(edit: ((d: Record<string, unknown>) => void) | undefined, ...ops: string[]): Obj {
  return (deriveDocument(base(edit), ops.map(op)) as { obj: Obj }).obj;
}

function refused(edit: ((d: Record<string, unknown>) => void) | undefined, opText: string, words: string): void {
  assert.throws(() => deriveDocument(base(edit), [op(opText)]), (e: unknown) => e instanceof DerivationError && e.message.includes(words), `want a refusal saying ${words}`);
}

const member = (doc: Obj, list: string, i: number): Obj => ((doc.get(list) as JValue[])[i] as { obj: Obj }).obj;

test('every refusal of the derivation is held by its own words (part 25i)', () => {
  const vm = (extra: string) => `{"type":"addVerificationMethod","verificationMethod":{"id":"${DID}#k2","type":"Multikey","controller":"${DID}"${extra}}}`;
  refused(undefined, vm(',"threshold":2.5'), 'is not an integer literal');
  refused(undefined, vm(',"threshold":2.0'), 'is not an integer literal');
  refused(undefined, vm(',"threshold":-1'), 'threshold');
  refused(undefined, `{"type":"updateVerificationMethod","verificationMethodId":"${DID}#k1","updates":{"threshold":2.5}}`, 'threshold');
  refused(undefined, `{"type":"addVerificationMethod","verificationMethod":{"id":"${DID}#k2","controller":"${DID}"}}`, 'id, type and controller are required');
  refused(undefined, `{"type":"addService","service":{"id":"${DID}#s2","serviceEndpoint":"https://b"}}`, 'id, type and endpoint are required');
  refused(undefined, `{"type":"addService","service":{"id":"${DID}#s2","type":"T","serviceEndpoint":null}}`, 'id, type and endpoint are required');
});

test('every document the derivation yields has exactly its members (part 25i)', () => {
  let doc = derive(undefined,
    `{"type":"addVerificationMethod","verificationMethod":{"id":"${DID}#k2","type":"Multikey","controller":"${DID}","threshold":18446744073709549568,"keyPageUrl":null}}`,
    `{"type":"addService","service":{"id":"${DID}#s2","type":"T","serviceEndpoint":"https://b","priority":-1,"routingKeys":[]}}`,
    `{"type":"addService","service":{"id":"${DID}#s3","type":"T","serviceEndpoint":"https://c","priority":9223372036854774784}}`);
  assert.deepEqual(member(doc, 'verificationMethod', 1).get('threshold'), { num: '18446744073709549568' });
  assert.equal(member(doc, 'verificationMethod', 1).has('keyPageUrl'), false);
  assert.deepEqual(member(doc, 'service', 1).get('priority'), { num: '-1' });
  assert.equal(member(doc, 'service', 1).has('routingKeys'), false);
  assert.deepEqual(member(doc, 'service', 2).get('priority'), { num: '9223372036854774784' });
  // an update reads a number as an entry stores it (2.0 is 2) and lands in the document's own method
  doc = derive(undefined, `{"type":"updateVerificationMethod","verificationMethodId":"${DID}#k1","updates":{"threshold":2.0}}`);
  assert.deepEqual(member(doc, 'verificationMethod', 0).get('threshold'), { num: '2' });
  doc = derive((d) => { delete d.controller; }, `{"type":"addController","controllerDid":"did:y"}`);
  assert.equal(doc.get('controller'), 'did:y');
  doc = derive(undefined, `{"type":"addAlsoKnownAs","identifier":"https://x","foreign":{}}`);
  assert.deepEqual(doc.get('alsoKnownAs'), ['https://x']);
  doc = derive((d) => { d.alsoKnownAs = ['https://x', 'https://y']; }, `{"type":"removeAlsoKnownAs","identifier":"https://x"}`);
  assert.deepEqual(doc.get('alsoKnownAs'), ['https://y']);
  doc = derive((d) => { d.assertionMethod = [`${DID}#k1`, `${DID}#k9`]; }, `{"type":"removeRelationship","relationship":"assertionMethod","verificationMethodId":"${DID}#k9"}`);
  assert.equal(doc.get('assertionMethod'), `${DID}#k1`);
});

test('the parser and the canonical form are held at every boundary (part 25i)', () => {
  const notJSON = (text: string, words: string) =>
    assert.throws(() => parseJSON(text), (e: unknown) => e instanceof CanonicalJSONError && e.message.includes(words), `${text}: want ${words}`);
  notJSON('{"a":1 "b":2}', 'a comma or a closing brace');
  notJSON('"abc', 'an unterminated string');
  notJSON('"\\x0041"', 'an invalid escape');
  assert.equal(writeCanonical(parseJSON(' { "b" : [ 1 , 2 ] , "a" : { } } ')), '{"a":{},"b":[1,2]}');
  assert.equal(writeCanonical(parseJSON('{"\u{1F600}":1,"￿":2,"a":3,"ab":4}')), '{"a":3,"ab":4,"\u{1F600}":1,"￿":2}');
  assert.equal(canonicalNumber('-0'), '0');
  assert.equal(canonicalNumber('9007199254740992'), '9007199254740992');
  assert.equal(canonicalNumber('-9007199254740992'), '-9007199254740992');
  for (const text of ['9007199254740993', '-9007199254740993']) {
    assert.throws(() => canonicalNumber(text), (e: unknown) => e instanceof CanonicalJSONError && e.refusal === 'inexact-integer', text);
  }
});
