/**
 * Task Template Marketplace SDK tests (nextux-04).
 *
 * Run via the package test script (tsc → node --test). They are the JSON
 * fixture-compatibility tests: the SDK consumes the Go-generated catalog
 * (src/tasks/templates.fixture.json, kept byte-identical to pkg/tasks by a Go
 * drift test) and exposes the same trusted, signed templates.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createTasksClient,
  isTrusted,
  planActions,
  missingInputs,
  runCommand,
  type CatalogFixture,
} from './index';

function loadFixture(): CatalogFixture {
  const p = join(__dirname, '..', '..', 'src', 'tasks', 'templates.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as CatalogFixture;
}

const fx = loadFixture();
const client = createTasksClient(fx);

test('catalog ships >=12 official templates, all official_verified', () => {
  assert.equal(fx.version, 1);
  assert.ok(fx.templates.length >= 12, `expected >=12 templates, got ${fx.templates.length}`);
  for (const t of fx.templates) {
    assert.equal(t.trust, 'official_verified', `${t.id} should be official_verified`);
    assert.ok(isTrusted(t.trust));
    assert.ok(t.actions.length > 0, `${t.id} has no actions`);
    assert.ok(t.actions.every((a) => a.uses), `${t.id} has an action with no agent action`);
  }
});

test('client list/search/get work', () => {
  assert.ok(client.list().length === fx.templates.length);
  const hits = client.search('escrow');
  assert.ok(hits.some((t) => t.id === 'infrix/regulated-escrow'));
  const t = client.get('infrix/regulated-escrow');
  assert.ok(t && t.id === 'infrix/regulated-escrow');
  assert.equal(client.trusted('infrix/regulated-escrow'), true);
});

test('planActions returns the ordered wrapped agent actions', () => {
  const t = client.get('infrix/regulated-escrow')!;
  const steps = planActions(t);
  assert.deepEqual(steps.map((s) => s.uses), ['workflow.execute', 'proof.verify']);
});

test('missingInputs catches a required field (bring-your-own-proof needs bundle)', () => {
  const byop = client.get('infrix/bring-your-own-proof')!;
  assert.deepEqual(missingInputs(byop, {}), ['bundle']);
  assert.deepEqual(missingInputs(byop, { bundle: {} }), []);
});

test('a template never carries an assurance level (it comes from execution)', () => {
  for (const t of fx.templates) {
    assert.ok(!('assurance' in (t as unknown as Record<string, unknown>)), `${t.id} must not declare assurance`);
  }
});

test('runCommand builds the canonical CLI invocation', () => {
  const t = client.get('infrix/first-proof')!;
  assert.equal(runCommand(t, { outDir: 'out' }), 'infrix tasks run infrix/first-proof --out out');
});
