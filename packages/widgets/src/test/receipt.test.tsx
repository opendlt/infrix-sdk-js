// @infrix/widgets — InfrixProofReceipt render tests (nextux-09).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { InfrixProofReceipt } from '../ProofReceipt.js';
import { verifyStory, verifyReceiptResult } from '../verifier.js';
import { loadSampleBundle, tamperedBundle } from './fixtures.js';

test('renders a verified receipt with the honest local-only label and no "Fully verified"', async () => {
  const result = await verifyStory(loadSampleBundle());
  const html = renderToStaticMarkup(<InfrixProofReceipt result={result} />);
  assert.match(html, /Verified/);
  assert.match(html, /Locally verified\. Live L0 not checked\./);
  assert.equal(html.includes('Fully verified'), false, 'an offline receipt must not say "Fully verified"');
  // The widget root is scoped + themed.
  assert.match(html, /class="iw-widget iw-widget-receipt"/);
  assert.match(html, /data-theme="auto"/);
});

test('renders a failed receipt with no positive badge', async () => {
  const result = await verifyStory(tamperedBundle());
  const html = renderToStaticMarkup(<InfrixProofReceipt result={result} />);
  assert.match(html, /Not verified/);
  assert.equal(html.includes('data-role="positive"'), false, 'a failed verification shows no green badge');
});

test('honors compact + dark variant props', async () => {
  const result = verifyReceiptResult({
    version: '1', subject: { type: 'evidence', id: 'e' }, summary: 'ok', status: 'verified',
    assurance: { proofLevel: 'L3', label: 'L3', nodeTrusted: false, l0Verified: false },
    artifacts: {}, verification: {}, warnings: [],
  });
  const html = renderToStaticMarkup(<InfrixProofReceipt result={result} theme="dark" variant="compact" />);
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /data-variant="compact"/);
});
