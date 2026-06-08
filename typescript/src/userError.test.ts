// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InfrixUserError,
  parseUserError,
  isStableErrorCode,
  type UserErrorPayload,
} from './userError';

const PAYLOAD: UserErrorPayload = {
  code: 'L0_KEY_PAGE_RESOLVER_MISSING',
  title: 'This node cannot verify the signer against Accumulate L0',
  message: 'This node cannot verify the signer against Accumulate L0.',
  impact: 'MetaMask signed the request, but Infrix cannot prove the key is authorized.',
  fixes: [
    { label: 'Start the node with an L0 endpoint', command: 'infrix node --config <c>', safeToRun: false },
    { label: 'Or use local demo mode', command: 'infrix demo start --mode local', safeToRun: true },
  ],
  docs: 'docs/errors/l0-key-page-resolver-missing.md',
  retryable: false,
};

test('isStableErrorCode distinguishes stable codes from numeric RPC codes', () => {
  assert.equal(isStableErrorCode('L0_KEY_PAGE_RESOLVER_MISSING'), true);
  assert.equal(isStableErrorCode('METAMASK_USER_REJECTED'), true);
  assert.equal(isStableErrorCode(-32000), false);
  assert.equal(isStableErrorCode('lowercase'), false);
});

test('parseUserError maps a v4 envelope (code+details) to a typed error', () => {
  // mirrors WriteV4UserError: {code, message, details: <full UserError>}
  const envelope = { code: PAYLOAD.code, message: PAYLOAD.message, details: PAYLOAD };
  const ue = parseUserError(envelope);
  assert.ok(ue instanceof InfrixUserError);
  assert.equal(ue!.code, PAYLOAD.code);
  assert.equal(ue!.impact, PAYLOAD.impact);
  assert.equal(ue!.fixes.length, 2);
  assert.equal(ue!.docs, PAYLOAD.docs);
  assert.equal(ue!.retryable, false);
});

test('parseUserError maps a bare payload and an RPC data payload', () => {
  assert.equal(parseUserError(PAYLOAD)!.code, PAYLOAD.code);
  assert.equal(parseUserError({ code: -32000, message: 'x', data: PAYLOAD })!.code, PAYLOAD.code);
});

test('parseUserError returns null for a legacy numeric-coded error', () => {
  assert.equal(parseUserError({ code: -32601, message: 'method not found' }), null);
  assert.equal(parseUserError(null), null);
  assert.equal(parseUserError('nope'), null);
});

test('InfrixUserError is an Error carrying the stable code and renders human form', () => {
  const ue = new InfrixUserError(PAYLOAD);
  assert.ok(ue instanceof Error);
  assert.equal(ue.name, 'InfrixUserError');
  const human = ue.toHuman();
  assert.match(human, /L0_KEY_PAGE_RESOLVER_MISSING/);
  assert.match(human, /Why it matters/);
  assert.match(human, /infrix demo start --mode local/);
  assert.match(human, /docs\/errors\/l0-key-page-resolver-missing\.md/);
});
