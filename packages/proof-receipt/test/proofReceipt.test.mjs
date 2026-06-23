// @infrix/proof-receipt tests (adoption-10): the package imports, the one-call
// happy path verifies a known-good bundle, offline vs live labeling is honest,
// receipts validate, a malformed bundle fails closed, and the receipt renders.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyProof, validateReceipt, renderReceipt, renderReceiptText } from '../index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// @infrix/verify (workspace sibling, drift-fenced) holds the sample proof.
const fixturePath = path.join(here, '..', '..', 'verify', 'src', 'portable-fixture.valid.json');
const bundle = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

test('the package imports and exposes its API', () => {
  assert.equal(typeof verifyProof, 'function');
  assert.equal(typeof renderReceipt, 'function');
  assert.equal(typeof validateReceipt, 'function');
  assert.equal(typeof renderReceiptText, 'function');
});

test('verifyProof verifies a known-good bundle offline and the receipt validates', async () => {
  const receipt = await verifyProof(bundle);
  assert.equal(receipt.status, 'verified');
  assert.equal(receipt.assurance.nodeTrusted, false, 'no node trust');
  assert.equal(receipt.assurance.l0Verified, false, 'offline never claims L0');
  assert.deepEqual(validateReceipt(receipt), [], 'an honest offline receipt validates');
  const text = renderReceiptText(receipt);
  assert.match(text, /VERIFIED/);
});

test('offline vs live labeling is honest when an l0 endpoint is given', async () => {
  const receipt = await verifyProof(bundle, { l0: 'kermit' });
  assert.equal(receipt.assurance.l0Verified, false, 'offline package never inflates to L4');
  assert.match(receipt.verification.command, /--l0 kermit/);
  assert.ok(
    receipt.warnings.some((w) => /offline verification only/.test(w)),
    'a clear offline-only warning is present',
  );
});

test('a malformed bundle fails closed (no false verified)', async () => {
  const broken = JSON.parse(JSON.stringify(bundle));
  broken.exportHash = '00'.repeat(32); // break the export hash
  const receipt = await verifyProof(broken);
  assert.notEqual(receipt.status, 'verified');
  assert.equal(receipt.assurance.l0Verified, false);
});

test('rejects a non-object bundle with a typed error', async () => {
  await assert.rejects(() => verifyProof('not-a-bundle'), /must be a parsed portable evidence package/);
});

test('renderReceipt mounts a card into a DOM element', async () => {
  installFakeDom();
  const receipt = await verifyProof(bundle);
  const host = document.createElement('div');
  const card = renderReceipt(receipt, host);
  assert.ok(card, 'a card element is returned');
  assert.ok(host.children.length > 0, 'the card is mounted into the host');
  uninstallFakeDom();
});

// --- minimal FakeDom (no browser) ---
let savedDoc;
function installFakeDom() {
  savedDoc = globalThis.document;
  class FakeNode {
    constructor(tag) {
      this.tagName = String(tag).toUpperCase();
      this.children = [];
      this.dataset = {};
      this.attributes = {};
      this._className = '';
      this.textContent = '';
    }
    get className() { return this._className; }
    set className(v) { this._className = v || ''; }
    appendChild(c) { this.children.push(c); return c; }
    replaceChildren(...k) { this.children = k.slice(); }
    setAttribute(k, v) { this.attributes[k] = String(v); }
  }
  globalThis.document = { createElement: (t) => new FakeNode(t) };
}
function uninstallFakeDom() {
  globalThis.document = savedDoc;
}
