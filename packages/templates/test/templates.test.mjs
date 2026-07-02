// @infrix/templates tests (DX P2-5): every template scaffolds valid, runnable
// files that use the REAL credential/predicate APIs — and never the old
// placeholder (`kyc-tier-2`) or a hardcoded endpoint.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listTemplates, scaffoldFiles, getTemplate } from '../src/index.js';

test('every template scaffolds a valid package.json and index.js', () => {
  for (const id of listTemplates()) {
    const files = scaffoldFiles(id, 'demo-app');
    assert.ok(files['index.js'], `${id} has index.js`);
    const pkg = JSON.parse(files['package.json']); // throws on invalid JSON
    assert.equal(pkg.name, 'demo-app');
    assert.ok(pkg.dependencies['@infrix/client'], `${id} depends on @infrix/client`);
  }
});

test('generated index.js is syntactically valid JS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'infrix-tpl-'));
  for (const id of listTemplates()) {
    const file = join(dir, `${id}.mjs`);
    writeFileSync(file, scaffoldFiles(id, 'x')['index.js']);
    // node --check parses without executing.
    execFileSync(process.execPath, ['--check', file]);
  }
});

test('no template contains the kyc-tier-2 placebo or a hardcoded endpoint', () => {
  for (const id of listTemplates()) {
    const idx = scaffoldFiles(id, 'x')['index.js'];
    assert.ok(!idx.includes('kyc-tier-2'), `${id} must not contain the kyc-tier-2 placeholder`);
    assert.ok(!idx.includes('localhost:8080'), `${id} must use the 'kermit' preset, not a hardcoded endpoint`);
    assert.ok(idx.includes("new InfrixClient('kermit'"), `${id} should connect via the kermit preset with a disclosure context`);
  }
});

test('credential templates issue a REAL verifiable credential', () => {
  const gated = scaffoldFiles('credential-gated', 'x')['index.js'];
  assert.ok(gated.includes('credentials.issue'), 'credential-gated must issue a real VC (not a placeholder)');
  const issue = scaffoldFiles('issue-credential', 'x')['index.js'];
  assert.ok(issue.includes('credentials.issue') && issue.includes('createDID'));
});

test('selective-disclosure template uses present + prover + verify', () => {
  const sd = scaffoldFiles('selective-disclosure-vp', 'x')['index.js'];
  assert.ok(sd.includes('credentials.present'), 'must call credentials.present');
  assert.ok(sd.includes('@infrix/prover'), 'must load the prover');
  assert.ok(sd.includes('predicates.verify'), 'must verify the produced envelope');
});

test('getTemplate / scaffoldFiles reject unknown ids', () => {
  assert.equal(getTemplate('nope'), undefined);
  assert.throws(() => scaffoldFiles('nope', 'x'), /unknown template/);
});
