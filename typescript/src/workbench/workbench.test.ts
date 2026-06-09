// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createWorkbenchClient,
  clientFromFixture,
  verifyPlanHonesty,
  explainPlan,
  isRefused,
  type WorkbenchFixture,
} from './index';

function loadFixture(): WorkbenchFixture {
  const p = join(__dirname, '..', '..', 'src', 'workbench', 'workbench.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as WorkbenchFixture;
}

const fx = loadFixture();

test('the ask fixture selects the grounded regulated-escrow task', () => {
  assert.equal(fx.version, 1);
  const client = clientFromFixture(fx);
  assert.equal(client.isActionable(), true);
  const sel = client.selected();
  assert.ok(sel, 'expected a selection');
  assert.equal(sel!.kind, 'task');
  assert.equal(sel!.id, 'infrix/regulated-escrow');
  assert.ok(client.planHash().startsWith('sha256:'), 'plan must be hash-bound');
});

test('every candidate is grounded and the selection references one', () => {
  const client = clientFromFixture(fx);
  const sel = client.selected()!;
  const match = client.candidates().find((c) => c.kind === sel.kind && c.id === sel.id);
  assert.ok(match, 'selected capability must be one of the grounded candidates');
  for (const c of client.candidates()) {
    assert.ok(c.confidence >= 0 && c.confidence <= 1, `${c.id} confidence out of range`);
    assert.ok(c.id && c.kind && c.title, `${c.id} missing fields`);
  }
});

test('the plan honors the workbench safety invariants', () => {
  const issues = verifyPlanHonesty(fx.ask.plan);
  assert.deepEqual(issues, [], `ask plan violated invariants: ${issues.join('; ')}`);
  assert.equal(fx.ask.plan.safety.mainnetWrite, false);
  assert.notEqual(fx.ask.plan.network, 'mainnet');
});

test('the refusal fixture fails closed with a safe alternative', () => {
  const client = createWorkbenchClient(fx.refusal.plan);
  assert.equal(client.isRefused(), true);
  assert.equal(client.isActionable(), false);
  assert.equal(client.selected(), null, 'a refused plan must not select a capability');
  const refusals = client.refusals();
  assert.ok(refusals.some((r) => r.code === 'overclaim_l4_without_l0'));
  for (const r of refusals) {
    assert.ok(r.safeAlternative && r.safeAlternative.length > 0, `${r.code} missing a safe alternative`);
  }
  // verifyPlanHonesty must still find the refused plan structurally honest.
  assert.deepEqual(verifyPlanHonesty(fx.refusal.plan), []);
});

test('explainPlan renders plain-language text for both ask and refusal', () => {
  const askText = explainPlan(fx.ask.plan);
  assert.match(askText, /regulated-escrow/);
  assert.match(askText, /verifier/);
  const refusalText = explainPlan(fx.refusal.plan);
  assert.ok(isRefused(fx.refusal.plan));
  assert.match(refusalText, /Refused/);
});
