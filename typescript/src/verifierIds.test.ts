/**
 * Verifier-id parity: a client built from this package can NAME exactly the
 * proof verifiers the node registers, no more and no fewer.
 *
 * ../verifier-ids.json is the node's production verifier census (infrix-core
 * docs/release/census/verifiers.txt), vendored beside goal-vocabulary.json.
 * infrix-core's convergence unit-parity measure reads this package's declaration
 * against that census directly; this test keeps the vendored copy and the typed
 * constant from drifting apart inside the package.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { VERIFIER_IDS, isVerifierId } from './index';

// dist/verifierIds.test.js -> typescript/ -> repo root.
const census: { verifiers: string[] } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'verifier-ids.json'), 'utf8'),
);

test('the vendored verifier census is non-trivial and sorted without duplicates', () => {
  assert.ok(census.verifiers.length > 0);
  assert.deepEqual([...census.verifiers], [...new Set(census.verifiers)].sort());
});

test('VERIFIER_IDS names exactly the node census, no more and no fewer', () => {
  const declared = new Set<string>(VERIFIER_IDS);
  const node = new Set(census.verifiers);
  assert.deepEqual([...node].filter((id) => !declared.has(id)).sort(), [], 'node verifiers the SDK cannot name');
  assert.deepEqual([...declared].filter((id) => !node.has(id)).sort(), [], 'SDK ids the node does not register');
  assert.equal(declared.size, VERIFIER_IDS.length, 'a verifier id is declared twice');
});

test('isVerifierId accepts every registered id and refuses what the node would refuse', () => {
  for (const id of census.verifiers) assert.equal(isVerifierId(id), true, id);
  for (const bad of ['', 'ED25519', 'ed25518', 'groth16', 'vc-w3c-ed25519-', undefined, null, 7]) {
    assert.equal(isVerifierId(bad), false, String(bad));
  }
});
