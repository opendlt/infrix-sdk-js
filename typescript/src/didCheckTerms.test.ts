// The SDK names every string Infrix emits or requires on a DID, credential or presentation, with the standards disposition the node's census files for
// it (docs/release/census/w3c-identity-surface.txt in the node repository; the table is generated from it by scripts/gen-w3c-terms-ts.py, which refuses a
// stale one). `didCheck.termDisposition` answers from that table and asks no node.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';
import { W3C_IDENTITY_TERMS } from './sub-clients/didCheck';

const client = () => new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'audit' });

test('termDisposition answers what Infrix makes of a term it names', () => {
  const c = client();
  assert.equal(c.didCheck.termDisposition('https://www.w3.org/ns/did/v1'), 'OK');
  assert.equal(c.didCheck.termDisposition('did:infrix'), 'INVALID');
  assert.equal(c.didCheck.termDisposition('did:lattica'), 'SUPERSEDED');
  assert.equal(c.didCheck.termDisposition('https://infrix.opendlt.org/ns/did/v1'), 'DANGLING');
  assert.equal(c.didCheck.termDisposition('AccumulateKeyPage'), 'PRIVATE');
});

test('termDisposition says nothing of a string Infrix does not name, and of nothing inherited from Object', () => {
  const c = client();
  assert.equal(c.didCheck.termDisposition('https://example.com/ns/nope/v1'), undefined);
  assert.equal(c.didCheck.termDisposition('toString'), undefined);
  assert.equal(c.didCheck.termDisposition('__proto__'), undefined);
  assert.equal(c.didCheck.termDisposition(''), undefined);
});

test('every term in the table answers its own disposition, and the retired methods are never OK', () => {
  const c = client();
  const terms = Object.keys(W3C_IDENTITY_TERMS);
  assert.ok(terms.length >= 40, `the table names ${terms.length} terms, the census names at least 40`);
  for (const t of terms) {
    assert.equal(c.didCheck.termDisposition(t), (W3C_IDENTITY_TERMS as Record<string, string>)[t], t);
  }
  for (const retired of ['did:infrix', 'did:lattica']) {
    assert.notEqual(c.didCheck.termDisposition(retired), 'OK', `${retired} is retired or invalid, never conformant as emitted`);
  }
});
