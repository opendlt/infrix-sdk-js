/**
 * Progressive Disclosure design system SDK tests (nextux-03).
 *
 * Run via the package test script (tsc → node --test). These are the JSON
 * fixture-compatibility tests: the SDK consumes the Go-generated fixture
 * (src/ux/ux.fixture.json, kept byte-identical to pkg/uxcopy by a Go drift
 * test), and the SDK gate must reach the SAME honest verdict as the Go gate —
 * no Live L0 badge without an L0 anchor, no green badge on a failed or merely
 * operator-attested state.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createUxRegistry,
  badgesFor,
  errorCardByCode,
  explainErrorCard,
  proofReceiptViewModel,
  nextActionsForPersona,
  UX_CATEGORIES,
  UX_PERSONAS,
  type UxFixture,
  type AssuranceState,
} from './index';

function loadFixture(): UxFixture {
  const p = join(__dirname, '..', '..', 'src', 'ux', 'ux.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as UxFixture;
}

const fx = loadFixture();
const reg = createUxRegistry(fx);

const liveL0: AssuranceState = {
  verified: true, cryptographicallyVerified: true, l0Verified: true, replayVerified: true,
  nodeTrusted: false, witnessQuorumMet: true, distinctOperatorsMet: true,
};
const offline: AssuranceState = { verified: true, cryptographicallyVerified: true, l0Verified: false, nodeTrusted: false };
const attested: AssuranceState = { operatorAttested: true, nodeTrusted: true };
const failed: AssuranceState = { verified: false, nodeTrusted: true };

test('fixture is structurally complete (every category + section)', () => {
  assert.equal(fx.version, '1');
  for (const c of UX_CATEGORIES) {
    assert.ok(fx.labels.some((l) => l.category === c), `missing labels for category ${c}`);
  }
  assert.ok(fx.assuranceBadges.length >= 11, 'expected the canonical badge set');
  assert.ok(fx.errors.length > 0 && fx.glossary.length > 0 && fx.nextActions.length > 0);
  assert.equal(fx.personas.length, UX_PERSONAS.length);
});

test('every assurance badge is well-formed (color role, sr label, conditions)', () => {
  const roles = new Set(['positive', 'info', 'caution', 'negative']);
  for (const b of fx.assuranceBadges) {
    assert.ok(b.id && b.short && b.plain && b.technical, `${b.id} missing text`);
    assert.ok(roles.has(b.colorRole), `${b.id} bad color role ${b.colorRole}`);
    assert.ok(b.screenReader, `${b.id} missing screen-reader label`);
    assert.ok(Array.isArray(b.allowedConditions) && Array.isArray(b.disallowedConditions));
  }
});

test('the gate matches Go: Live L0 needs an L0 anchor', () => {
  const live = reg.badgesFor(liveL0).map((b) => b.id);
  assert.ok(live.includes('assurance.live_l0'), 'Live L0 present with l0Verified');
  const off = badgesFor(fx.assuranceBadges, offline).map((b) => b.id);
  assert.ok(!off.includes('assurance.live_l0'), 'no Live L0 offline');
  assert.ok(off.includes('assurance.offline') && off.includes('assurance.no_node_trust'));
});

test('no green badge on a failed or operator-attested-only state', () => {
  for (const state of [failed, attested]) {
    const greens = reg.badgesFor(state).filter((b) => b.colorRole === 'positive');
    assert.equal(greens.length, 0, `green badge surfaced for ${JSON.stringify(state)}`);
  }
});

test('every error card has plain meaning, a fix, and a docs link', () => {
  for (const c of fx.errors) {
    assert.ok(c.plainMeaning, `${c.code} missing plain meaning`);
    assert.ok(c.fixes.length > 0, `${c.code} missing fixes`);
    assert.ok(c.docs, `${c.code} missing docs`);
  }
  const card = errorCardByCode(fx.errors, 'L0_ANCHOR_UNAVAILABLE');
  assert.ok(card, 'L0 anchor card present');
  assert.match(String(card!.assuranceImpact).toLowerCase(), /l3/);
  assert.ok(explainErrorCard(card!).length > 0);
});

test('every glossary term has plain + technical definitions', () => {
  for (const t of fx.glossary) {
    assert.ok(t.plain && t.technical && t.firstUseReplacement, `${t.term} incomplete`);
  }
  assert.ok(reg.glossaryLookup('Accumulate L0'), 'L0 glossary term present');
});

test('proof receipt view-model is honest (no green badge on failure)', () => {
  const vm = proofReceiptViewModel(fx.assuranceBadges, { status: 'failed', state: failed, summary: 'x' });
  assert.equal(vm.headline, 'NOT VERIFIED');
  assert.equal(vm.badges.filter((b) => b.colorRole === 'positive').length, 0);

  const ok = reg.proofReceipt({ status: 'verified', state: liveL0, summary: 'ok' });
  assert.equal(ok.headline, 'VERIFIED');
  assert.ok(ok.badges.some((b) => b.id === 'assurance.live_l0'));
});

test('next actions are persona-ordered (auditor leads with the verifier command)', () => {
  const acts = nextActionsForPersona(fx.nextActions, fx.personas, 'auditor');
  assert.ok(acts.length > 0);
  assert.equal(acts[0].id, 'next.copy_verify_command');
  assert.ok(acts.every((a) => a.personas.includes('auditor')));
  assert.equal(reg.nextActionsFor('agent')[0].id, 'next.list_actions');
});
