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

test('the golden-escrow template creates, exports, verifies offline, and shows assurance', () => {
  const files = scaffoldFiles('golden-escrow', 'escrow-app');
  const idx = files['index.js'];
  assert.ok(idx.includes('withGoldenApp'), 'uses the golden-app facade');
  assert.ok(idx.includes('escrow.create'), 'creates an escrow');
  assert.ok(idx.includes('proofs.export'), 'exports a proof');
  assert.ok(idx.includes('verifyOffline'), 'verifies the proof offline');
  assert.ok(idx.includes('assurance tier'), 'shows the assurance level');
});

test('every template demonstrates a fully-hydrated result + proof + assurance', () => {
  for (const t of TEMPLATES) {
    const idx = scaffoldFiles(t.id, 'app')['index.js'];
    // A high-level call awaited to a hydrated result (printGoverned prints the
    // real spine artifacts), with proof export + offline verification/assurance.
    assert.ok(idx.includes('printGoverned') || idx.includes('verifyOffline'),
      `${t.id} should await + print a hydrated governed result`);
    assert.ok(idx.includes('exportProof') || idx.includes('proofs.export'),
      `${t.id} should export a proof`);
    assert.ok(idx.includes('assurance') || idx.includes('verifyOffline'),
      `${t.id} should surface the assurance level`);
    // No template may present a fake gas zero or blank id.
    assert.ok(!/gasUsed:\s*0\b/.test(idx), `${t.id} must not hard-code gasUsed: 0`);
  }
});

test('unknown template id is rejected', () => {
  assert.throws(() => scaffoldFiles('nope', 'app'), /unknown template/);
  assert.equal(getTemplate('nope'), undefined);
});
