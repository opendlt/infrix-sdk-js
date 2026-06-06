/**
 * create-infrix-app template tests (platform-review-3 Epic 7).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TEMPLATES, listTemplates, getTemplate, scaffoldFiles } from './index';

test('all five golden templates are registered', () => {
  const ids = listTemplates();
  for (const want of [
    'golden-escrow',
    'governed-approval',
    'credential-gated-release',
    'bridge-receipt',
    'confidential-approval',
  ]) {
    assert.ok(ids.includes(want), `template ${want} should be registered`);
  }
  assert.equal(TEMPLATES.length, 5);
});

test('every template scaffolds a package.json + index.js + README', () => {
  for (const t of TEMPLATES) {
    const files = scaffoldFiles(t.id, 'my-app');
    assert.ok(files['package.json'], `${t.id} should write package.json`);
    assert.ok(files['index.js'], `${t.id} should write index.js`);
    assert.ok(files['README.md'], `${t.id} should write README.md`);
    const pkg = JSON.parse(files['package.json']) as { name: string; dependencies: Record<string, string> };
    assert.equal(pkg.name, 'my-app');
    assert.ok(pkg.dependencies['@infrix/client'], 'scaffold should depend on @infrix/client');
  }
});

test('the golden-escrow template can create an escrow, export, and verify a proof', () => {
  const files = scaffoldFiles('golden-escrow', 'escrow-app');
  const idx = files['index.js'];
  assert.ok(idx.includes('withGoldenApp'), 'uses the golden-app facade');
  assert.ok(idx.includes('escrow.create'), 'creates an escrow');
  assert.ok(idx.includes('proofs.export'), 'exports a proof');
  assert.ok(idx.includes('verifyLocal'), 'verifies the proof');
});

test('unknown template id is rejected', () => {
  assert.throws(() => scaffoldFiles('nope', 'app'), /unknown template/);
  assert.equal(getTemplate('nope'), undefined);
});
