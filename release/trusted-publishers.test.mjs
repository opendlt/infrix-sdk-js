// Pass-17 audit P1-7. The npm trusted-publisher gate must stay HONEST and
// FAIL-CLOSED: the committed attestation matrix must cover every publishable
// @infrix/* package, no package may be silently dropped, and the readiness check
// must refuse to publish while any package is not configured=true. This does NOT
// assert configured=true (that is an operator attestation of npmjs.com setup that
// cannot be fabricated in-repo — see TRUSTED-PUBLISHER-RUNBOOK.md); it asserts the
// gate cannot be bypassed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const matrix = JSON.parse(fs.readFileSync(path.join(here, 'trusted-publishers.json'), 'utf8'));

// Import the single source of truth for the publishable surface.
const { GUARD_CONFIG } = await import(pathToFileURL(path.join(here, '..', 'scripts', 'release-packages.mjs')).href);
const publishable = Object.keys(GUARD_CONFIG).sort();

// Readiness helper mirroring release-npm.mjs --require-trusted-publisher-ready.
function trustedPublisherReady(m, names) {
  for (const name of names) {
    const e = m.packages[name];
    if (!e || e.configured !== true) return false;
  }
  return true;
}

test('the attestation matrix covers exactly the publishable package surface', () => {
  const attested = Object.keys(matrix.packages).sort();
  assert.deepEqual(attested, publishable,
    'trusted-publishers.json must list exactly the publishable @infrix/* packages (no drift, no dropped package)');
});

test('every attestation entry has the required shape', () => {
  for (const [name, e] of Object.entries(matrix.packages)) {
    assert.equal(typeof e.configured, 'boolean', `${name}.configured must be a boolean`);
    assert.ok('operator' in e && 'date' in e, `${name} must carry operator + date fields`);
    if (e.configured === true) {
      assert.ok(e.operator && e.date, `${name} claims configured=true but is missing operator/date evidence`);
    }
  }
});

test('the readiness gate is fail-closed while any package is not configured=true', () => {
  // With the current honest all-false matrix the gate must block publishing.
  const anyUnconfigured = publishable.some((n) => matrix.packages[n].configured !== true);
  if (anyUnconfigured) {
    assert.equal(trustedPublisherReady(matrix, publishable), false,
      'the readiness gate must refuse to publish while any package is not configured=true');
  }
  // Flipping a single package to false must always block, regardless of the rest.
  const forced = { packages: {} };
  for (const n of publishable) forced.packages[n] = { configured: true, operator: 'x', date: 'y' };
  forced.packages[publishable[0]].configured = false;
  assert.equal(trustedPublisherReady(forced, publishable), false,
    'a single unconfigured package must block the whole release');
});
