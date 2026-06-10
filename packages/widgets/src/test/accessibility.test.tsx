// @infrix/widgets — accessibility tests (nextux-09).
//
// Every widget must carry accessible labels: a labeled group root, status/alert
// roles where appropriate, and aria-labels on interactive controls.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { InfrixProofReceipt } from '../ProofReceipt.js';
import { InfrixVerifyButton } from '../VerifyButton.js';
import { InfrixTrustBoundary } from '../TrustBoundary.js';
import { InfrixTaskCard } from '../TaskCard.js';
import { InfrixErrorResolution } from '../ErrorResolution.js';
import { verifyStory, verifyReceiptResult } from '../verifier.js';
import { loadSampleBundle } from './fixtures.js';

test('every widget root is a labeled group', async () => {
  const result = await verifyStory(loadSampleBundle());
  const receipt = verifyReceiptResult({
    version: '1', subject: { type: 'evidence', id: 'e' }, summary: 'ok', status: 'verified',
    assurance: { proofLevel: 'L3', label: 'L3', nodeTrusted: false, l0Verified: false },
    artifacts: {}, verification: {}, warnings: [],
  });
  const markups: Array<[string, string]> = [
    ['receipt', renderToStaticMarkup(<InfrixProofReceipt result={result} />)],
    ['verify', renderToStaticMarkup(<InfrixVerifyButton bundle={{}} />)],
    ['trust', renderToStaticMarkup(<InfrixTrustBoundary result={receipt} />)],
    ['task', renderToStaticMarkup(<InfrixTaskCard task={{ id: 't', title: 'A task', trust: 'official_verified' }} />)],
    ['error', renderToStaticMarkup(<InfrixErrorResolution error="AGENT_APPROVAL_EXPIRED" />)],
  ];
  for (const [name, html] of markups) {
    assert.match(html, /role="group"/, `${name} root must be a group`);
    assert.match(html, /aria-label="/, `${name} root must be labeled`);
  }
});

test('the verify button is a labeled, typed button', () => {
  const html = renderToStaticMarkup(<InfrixVerifyButton bundle={{}} label="Check it" />);
  assert.match(html, /<button[^>]*type="button"/);
  assert.match(html, /Check it/);
});

test('the error card uses the canonical wording and a fix command', () => {
  const html = renderToStaticMarkup(<InfrixErrorResolution error="AGENT_APPROVAL_EXPIRED" />);
  assert.match(html, /role="alert"/);
  assert.match(html, /approval has expired/i);
  assert.match(html, /infrix agent approve/);
});

test('the task card never shows a positive trust chip for an unsigned source', () => {
  const html = renderToStaticMarkup(<InfrixTaskCard task={{ id: 't', title: 'X', trust: 'local_unsigned' }} />);
  assert.equal(html.includes('data-trust="official_verified"'), false);
  assert.match(html, /data-trust="unverified"/);
});
