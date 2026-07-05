/**
 * Session scope enforcement tests (audit Z2).
 *
 * Governance authority is DEFAULT-DENY: a session must be explicitly granted
 * allowIntentSubmit/allowApproval, and every governance sub-constraint
 * (goal types, gas budget, object types, capabilities, roles) is enforced when
 * the operation supplies the matching param. Previously normalizeScope dropped
 * these fields, so a session created without governance authority — or one that
 * explicitly denied it — could still submit intents and approvals (fail open).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SessionManager } from './session';
import { MemoryKeyStore } from './keystore';

async function newManager() {
  const ks = new MemoryKeyStore();
  const sm = new SessionManager('acc://alice.acme', ks);
  return sm;
}

test('explicit deny scope cannot submit intents or approvals (the Z2 repro)', async () => {
  const sm = await newManager();
  const s = await sm.createSession({
    allowIntentSubmit: false,
    allowApproval: false,
    allowedGoalTypes: ['READ_ONLY'],
    maxUses: 1,
  });
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { goalType: 'CONTRACT_DEPLOY' }), /not authorized for intent submission/);
  assert.throws(() => sm.validate(s.publicKey, 'approval.submit'), /not authorized for approvals/);
});

test('default-deny: a scope that never granted governance authority is denied', async () => {
  const sm = await newManager();
  const s = await sm.createSession({ contracts: ['acc://game.acme'], maxUses: 5 });
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { goalType: 'READ_ONLY' }), /not authorized for intent submission/);
  assert.throws(() => sm.validate(s.publicKey, 'approval.submit'), /not authorized for approvals/);
});

test('governance fields survive normalizeScope', async () => {
  const sm = await newManager();
  const s = await sm.createSession({
    allowIntentSubmit: true,
    allowApproval: true,
    allowedGoalTypes: ['READ_ONLY'],
    maxGasPerIntent: 1000,
    allowedObjectTypes: ['Doc'],
    allowedCapabilities: ['read'],
    allowedRoles: ['viewer'],
  });
  assert.equal(s.scope.allowIntentSubmit, true);
  assert.equal(s.scope.allowApproval, true);
  assert.deepEqual(s.scope.allowedGoalTypes, ['READ_ONLY']);
  assert.equal(s.scope.maxGasPerIntent, 1000);
  assert.deepEqual(s.scope.allowedObjectTypes, ['Doc']);
  assert.deepEqual(s.scope.allowedCapabilities, ['read']);
  assert.deepEqual(s.scope.allowedRoles, ['viewer']);
});

test('granted intent authority allows submit, and enforces goal-type allow-list', async () => {
  const sm = await newManager();
  const s = await sm.createSession({ allowIntentSubmit: true, allowedGoalTypes: ['READ_ONLY'] });
  // Allowed goal type passes.
  assert.doesNotThrow(() => sm.validate(s.publicKey, 'intent.submit', { goalType: 'READ_ONLY' }));
  // Disallowed goal type is rejected.
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { goalType: 'CONTRACT_DEPLOY' }), /not authorized for goal type/);
  // No goalType param supplied — cannot be validated, allowed.
  assert.doesNotThrow(() => sm.validate(s.publicKey, 'intent.submit'));
});

test('granted approval authority allows approval.submit', async () => {
  const sm = await newManager();
  const s = await sm.createSession({ allowApproval: true });
  assert.doesNotThrow(() => sm.validate(s.publicKey, 'approval.submit'));
});

test('per-intent gas budget is enforced', async () => {
  const sm = await newManager();
  const s = await sm.createSession({ allowIntentSubmit: true, maxGasPerIntent: 1000 });
  assert.doesNotThrow(() => sm.validate(s.publicKey, 'intent.submit', { gas: 1000 }));
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { gas: 1001 }), /exceeds per-intent budget/);
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { gasLimit: 5000 }), /exceeds per-intent budget/);
});

test('object type, capability, and role allow-lists are enforced', async () => {
  const sm = await newManager();
  const s = await sm.createSession({
    allowIntentSubmit: true,
    allowedObjectTypes: ['Doc'],
    allowedCapabilities: ['read'],
    allowedRoles: ['viewer'],
  });
  assert.doesNotThrow(() => sm.validate(s.publicKey, 'intent.submit', { objectType: 'Doc', capability: 'read', role: 'viewer' }));
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { objectType: 'Secret' }), /not authorized for object type/);
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { capability: 'write' }), /not authorized for capability/);
  assert.throws(() => sm.validate(s.publicKey, 'intent.submit', { role: 'admin' }), /not authorized for role/);
});

test('contract-scoped sessions are unaffected and still enforce their whitelist', async () => {
  const sm = await newManager();
  const s = await sm.createSession({ contracts: ['acc://game.acme'], functions: ['move'] });
  assert.doesNotThrow(() => sm.validate(s.publicKey, 'acc://game.acme', 'move'));
  assert.throws(() => sm.validate(s.publicKey, 'acc://other.acme', 'move'), /not authorized for contract/);
  assert.throws(() => sm.validate(s.publicKey, 'acc://game.acme', 'transfer'), /not authorized for function/);
});
