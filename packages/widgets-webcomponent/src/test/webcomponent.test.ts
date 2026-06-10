// @infrix/widgets-webcomponent — tests (nextux-09).
//
// The Web Component reuses the React-free verifier core and renders honest
// markup. These run in Node with NO DOM and NO React, proving the component
// works without React (the full browser behavior is covered by the ux-gate
// Playwright spec).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyStory } from '@infrix/widgets/verifier';
import {
  renderReceiptHTML,
  renderVerifyResultHTML,
  renderErrorHTML,
} from '../render.js';
import {
  defineElements,
  ELEMENT_TAGS,
  InfrixProofReceiptElement,
  InfrixVerifyButtonElement,
} from '../elements.js';
import { loadSampleBundle, tamperedBundle } from './fixtures.js';

test('the module loads + registers without React or a DOM', () => {
  // Importing the elements module did not throw (Base falls back to a plain
  // class when HTMLElement is absent), and the API is present.
  assert.equal(typeof InfrixProofReceiptElement, 'function');
  assert.equal(typeof InfrixVerifyButtonElement, 'function');
  assert.equal(typeof defineElements, 'function');
  assert.equal(ELEMENT_TAGS.receipt, 'infrix-proof-receipt');
  // defineElements is a safe no-op when customElements is unavailable.
  assert.doesNotThrow(() => defineElements());
});

test('renders an honest verified receipt (offline, no "Fully verified")', async () => {
  const result = await verifyStory(loadSampleBundle());
  const html = renderReceiptHTML(result, { theme: 'dark', variant: 'compact' });
  assert.match(html, /class="iw-widget iw-widget-receipt"/);
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /data-variant="compact"/);
  assert.match(html, /Verified/);
  assert.match(html, /Locally verified\. Live L0 not checked\./);
  assert.equal(html.includes('Fully verified'), false);
  assert.match(html, /role="group"/);
  assert.match(html, /aria-label="Proof receipt"/);
});

test('a tampered story renders not-verified with no green badge', async () => {
  const result = await verifyStory(tamperedBundle());
  const html = renderReceiptHTML(result);
  assert.match(html, /Not verified/);
  assert.equal(html.includes('data-role="positive"'), false);
});

test('escapes HTML so a malicious field cannot inject markup', async () => {
  const result = await verifyStory(loadSampleBundle());
  (result as { honestLabel: string }).honestLabel = '<img src=x onerror=alert(1)>';
  const html = renderReceiptHTML(result);
  assert.equal(html.includes('<img src=x'), false, 'untrusted text must be escaped');
  assert.match(html, /&lt;img/);
});

test('renderVerifyResultHTML + renderErrorHTML produce labeled regions', async () => {
  const result = await verifyStory(loadSampleBundle());
  assert.match(renderVerifyResultHTML(result), /role="status"/);
  assert.match(renderErrorHTML('nope'), /role="alert"/);
});
