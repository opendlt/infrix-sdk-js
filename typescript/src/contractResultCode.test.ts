import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CONTRACT_RESULT_CODES,
  classifyContractResultCode,
  contractResultName,
  describeContractRefusal,
} from './contractResultCode';

// Matrix row A.ABI.RESULTCODE.REGISTRY.

// dist/ -> typescript/ -> infrix-sdk-js/ -> Infrix/
const crate = join(__dirname, '..', '..', '..', 'infrix-crates', 'infrix-types', 'src', 'lib.rs');

/**
 * The direction matters: the crate is the source of truth, because every
 * already-deployed contract answers its numbers. A table this SDK chose for
 * itself would be a second registry mistranslating the first.
 */
test('the table matches the published Rust SDK', (t) => {
  let src: string;
  try {
    src = readFileSync(crate, 'utf8');
  } catch {
    t.skip(
      'infrix-crates is not checked out beside this repository, so the table cannot be ' +
        'compared to the enum it was copied from. A skip here is not a pass.',
    );
    return;
  }
  const start = src.indexOf('pub enum Error {');
  assert.ok(start >= 0, 'infrix_types no longer declares `pub enum Error`');
  const body = src.slice(start, start + src.slice(start).indexOf('\n}'));

  const fromCrate = new Map<number, string>();
  const pattern = /^ {4}(\w+) = (\d+),$/gm;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(body)) !== null) {
    fromCrate.set(Number(m[2]), m[1]);
  }
  assert.ok(fromCrate.size > 0, 'parsed no variants, so this test asserts nothing');

  fromCrate.forEach((name, code) => {
    assert.equal(
      CONTRACT_RESULT_CODES[code],
      name,
      'code ' + code + ' is ' + name + ' in the published SDK but ' +
        CONTRACT_RESULT_CODES[code] + ' here',
    );
  });
  for (const key of Object.keys(CONTRACT_RESULT_CODES)) {
    assert.ok(
      fromCrate.has(Number(key)),
      'code ' + key + ' is in this table but not in the published SDK, so it names a ' +
        'refusal no contract can produce',
    );
  }
  assert.equal(Object.keys(CONTRACT_RESULT_CODES).length, fromCrate.size);
});

test('a caller can tell a wrong call from a refused one', () => {
  // The whole point of the row: these two used to be indistinguishable.
  assert.equal(classifyContractResultCode(-25), 'invalid_input');
  assert.equal(classifyContractResultCode(-7), 'execution_failed');

  assert.equal(classifyContractResultCode(-5), 'capability_denied');
  assert.equal(classifyContractResultCode(-31), 'capability_denied');
  assert.equal(classifyContractResultCode(-33), 'policy_denied');
  assert.equal(classifyContractResultCode(-30), 'approval_missing');
  assert.equal(classifyContractResultCode(-15), 'trust_failed');
  assert.equal(classifyContractResultCode(-17), 'internal_error');
  assert.equal(classifyContractResultCode(-4), 'internal_error');
  assert.equal(classifyContractResultCode(-11), 'execution_failed');
  assert.equal(classifyContractResultCode(-16), 'execution_failed');
});

test('every registered code has a class a caller can act on', () => {
  const allowed = new Set([
    'invalid_input',
    'capability_denied',
    'policy_denied',
    'approval_missing',
    'trust_failed',
    'internal_error',
    'execution_failed',
  ]);
  for (const key of Object.keys(CONTRACT_RESULT_CODES)) {
    const code = Number(key);
    if (code === 0) continue; // success is not a refusal
    assert.ok(
      allowed.has(classifyContractResultCode(-code)),
      'code ' + code + ' has no usable class',
    );
  }
});

test('an unregistered code is not given a borrowed meaning', () => {
  assert.equal(contractResultName(-4242), null);
  assert.equal(classifyContractResultCode(-4242), 'execution_failed');
  const refusal = describeContractRefusal(-4242);
  assert.ok(refusal);
  assert.equal(refusal.recognized, false);
  assert.match(refusal.message, /does not name/);
  assert.match(refusal.message, /-4242/);
});

test('a non-negative return is a byte count, not a refusal', () => {
  assert.equal(describeContractRefusal(8), null);
  assert.equal(describeContractRefusal(0), null);
  assert.throws(() => classifyContractResultCode(8), RangeError);
});

test('a recognised refusal names its variant', () => {
  const refusal = describeContractRefusal(-25);
  assert.ok(refusal);
  assert.equal(refusal.name, 'UnknownFunction');
  assert.equal(refusal.failureClass, 'invalid_input');
  assert.match(refusal.message, /UnknownFunction/);
});
