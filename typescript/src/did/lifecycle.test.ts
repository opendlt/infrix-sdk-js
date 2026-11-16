// THE REACTIVATION COMMITMENT AND THE LEDGER TIMES (core part 25j): each refusal by its own name, as core's statementchain and ledger_time hold them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2';
import { ed25519 } from '@noble/curves/ed25519';
import { JValue } from './canonicalJson';
import {
  LifecycleError, LifecycleOperation, checkPlacement, lifecycleMember, parseInstant, parseLedgerTimes, recoveryKey, verifyLifecycle, verifyTimes, withoutProof,
} from './lifecycle';

const b64 = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
const op = (type: string, members: Record<string, JValue> = {}): LifecycleOperation => ({ type, members: new Map(Object.entries(members)) });
const refused = (name: string) => (e: unknown) => e instanceof LifecycleError && e.refusal === name;

test('a reactivation is held to the commitment of the deactivation it undoes', () => {
  const recovery = new Uint8Array(32);
  const other = new Uint8Array(32).fill(1);
  const pub = ed25519.getPublicKey(recovery);
  const otherPub = ed25519.getPublicKey(other);
  const digest = sha256(new TextEncoder().encode('the statement without the proof'));
  const committed = [op('deactivate', { reactivationCommitment: b64(sha256(pub)) })];
  const reactivation = (key: Uint8Array, signer: Uint8Array) => [op('reactivate', { reactivationKey: b64(key), reactivationProof: b64(ed25519.sign(digest, signer)) }), op('addService')];
  verifyLifecycle(4, reactivation(pub, recovery), committed, false, true, () => digest);
  assert.deepEqual(recoveryKey(reactivation(pub, recovery)), pub);
  assert.equal(recoveryKey(committed), undefined);
  assert.equal(recoveryKey([]), undefined);
  assert.equal(recoveryKey([op('reactivate', { reactivationKey: 'x' })]), undefined);
  assert.throws(() => verifyLifecycle(4, reactivation(pub, recovery), [op('deactivate')], false, true, () => digest), refused('reactivation-final'));
  assert.throws(() => verifyLifecycle(4, reactivation(otherPub, other), committed, false, true, () => digest), refused('reactivation-key'));
  assert.throws(() => verifyLifecycle(4, [op('reactivate')], committed, false, true, () => digest), refused('reactivation-key'));
  assert.throws(() => verifyLifecycle(4, reactivation(pub, other), committed, false, true, () => digest), refused('reactivation-proof'));
  assert.throws(() => verifyLifecycle(4, [op('reactivate', { reactivationKey: b64(pub) })], committed, false, true, () => digest), refused('reactivation-proof'));
  assert.throws(() => verifyLifecycle(4, reactivation(pub, recovery), committed, false, true, () => sha256(digest)), refused('reactivation-proof'));
  assert.throws(() => verifyLifecycle(3, [op('deactivate', { reactivationCommitment: 'AAAA' })], [], true, false, () => digest), refused('statement-chain-refused'));
  verifyLifecycle(3, [op('addService')], [], false, false, () => digest);
  // a member that is not the canonical base64 of its length
  for (const bad of [7 as unknown as JValue, 'AAA', btoa('x'.repeat(31)), b64(pub).replace(/=+$/, '')]) {
    assert.throws(() => lifecycleMember(op('reactivate', { reactivationKey: bad }), 'reactivationKey', 32), refused('statement-chain-refused'), String(bad));
  }
  assert.equal(lifecycleMember(op('reactivate'), 'reactivationKey', 32), undefined);
  // what the proof covers: the reactivate operation without its proof, every other operation as it is
  const stripped = withoutProof(reactivation(pub, recovery));
  assert.equal(stripped[0].members.has('reactivationProof'), false);
  assert.equal(stripped[0].members.has('reactivationKey'), true);
  assert.equal(stripped[1].type, 'addService');
});

test('the lifecycle operations keep their places', () => {
  assert.throws(() => checkPlacement(1, [op('deactivate'), op('addService')]), (e: unknown) => e instanceof LifecycleError && /deactivate is the only operation/.test(e.message));
  assert.throws(() => checkPlacement(1, [op('addService'), op('reactivate')]), (e: unknown) => e instanceof LifecycleError && /reactivate is the first operation/.test(e.message));
  assert.throws(() => checkPlacement(1, [op('reactivate'), op('reactivate')]), (e: unknown) => e instanceof LifecycleError && /reactivate is the first operation/.test(e.message));
  assert.deepEqual(checkPlacement(1, [op('reactivate'), op('addService')]), { deactivates: false, reactivates: true });
  assert.deepEqual(checkPlacement(1, [op('deactivate')]), { deactivates: true, reactivates: false });
});

test('the stated times are held to the ledger times the file carries', () => {
  const t = (text: string) => parseInstant(text)!;
  const t0 = Date.parse('2026-10-12T19:41:30Z') / 1000;
  verifyTimes([{ versionId: '1', created: t('2026-10-12T19:41:30.7Z'), updated: t('2026-10-12T19:41:30.7Z') }, { versionId: '2', created: t('2026-10-12T19:41:30.7Z'), updated: t('2026-10-12T19:41:35Z') }], [t0, t0 + 6]);
  verifyTimes([{ versionId: '7', created: t('2026-10-12T18:41:30Z'), updated: t('2026-10-12T19:41:30Z') }], [t0]);
  assert.throws(() => verifyTimes([{ versionId: '1', created: t('2026-10-12T19:41:31Z'), updated: t('2026-10-12T19:41:31Z') }], [t0]), refused('time-after-ledger'));
  assert.throws(() => verifyTimes([{ versionId: '1', created: t('2026-10-12T19:41:30Z'), updated: t('2026-10-12T19:41:30Z') }, { versionId: '2', created: t('2026-10-12T19:41:30Z'), updated: t('2026-10-12T19:41:29Z') }], [t0, t0 + 60]), refused('time-before-predecessor'));
  assert.throws(() => verifyTimes([{ versionId: '1', created: t('2026-10-12T18:41:30Z'), updated: t('2026-10-12T19:41:30Z') }], [t0]), refused('created-time'));
  assert.throws(() => verifyTimes([{ versionId: '1', created: t('2026-10-12T19:41:30Z'), updated: t('2026-10-12T19:41:30Z') }, { versionId: '2', created: t('2026-10-12T19:41:30.5Z'), updated: t('2026-10-12T19:41:31Z') }], [t0, t0 + 1]), refused('created-time'));
  for (const list of [['2026-01-01T00:00:00Z'], ['x', 'y'], ['2026-01-01T00:00:00.5Z', '2026-01-01T00:00:01Z'], ['2026-01-01T01:00:00+01:00', '2026-01-01T01:00:01+01:00'], ['2026-01-01T00:00:01Z', '2026-01-01T00:00:00Z']]) {
    assert.throws(() => parseLedgerTimes(list, 2), refused('ledger-time'), JSON.stringify(list));
  }
  assert.equal(parseLedgerTimes(undefined, 2), undefined);
  assert.equal(parseLedgerTimes([], 2), undefined);
  assert.deepEqual(parseLedgerTimes(['2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'], 2), [1767225600, 1767225600]);
  assert.equal(parseInstant('yesterday'), undefined);
  assert.equal(parseInstant('2026-13-45T99:99:99Z'), undefined);
  assert.deepEqual(parseInstant('2026-01-01T00:00:00.123456789Z'), { seconds: 1767225600, nanos: 123456789 });
});
