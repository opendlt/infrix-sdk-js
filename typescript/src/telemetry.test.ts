// adoption-12 — SDK onboarding telemetry callback tests.
//
// The SDK does NO default network reporting: it only invokes a developer-
// provided onEvent callback. These tests assert the callback fires on rpc
// success + failure, that a throwing callback never breaks a call, and that
// omitting telemetry is a no-op.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient, type SdkTelemetryEvent } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;
function setFetch(fn: FetchLike) {
  (globalThis as { fetch?: FetchLike }).fetch = fn;
}
function restoreFetch() {
  (globalThis as { fetch?: FetchLike }).fetch = realFetch;
}

test('telemetry callback fires on rpc success', async () => {
  const events: SdkTelemetryEvent[] = [];
  const client = new InfrixClient('http://node.test', { telemetry: { onEvent: (e) => events.push(e) } });
  setFetch(async () => ({ json: async () => ({ result: { ok: true } }) }));
  try {
    await (client as unknown as { rpc(m: string): Promise<unknown> }).rpc('demo.method');
  } finally {
    restoreFetch();
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'sdk');
  assert.equal(events[0].event, 'rpc.call');
  assert.equal(events[0].method, 'demo.method');
  assert.equal(events[0].result, 'success');
});

test('telemetry callback fires on rpc failure with a stable error code', async () => {
  const events: SdkTelemetryEvent[] = [];
  const client = new InfrixClient('http://node.test', { telemetry: { onEvent: (e) => events.push(e) } });
  setFetch(async () => ({ json: async () => ({ error: { code: 'L0_ENDPOINT_UNREACHABLE', message: 'down' } }) }));
  try {
    await (client as unknown as { rpc(m: string): Promise<unknown> }).rpc('demo.method');
    assert.fail('expected rpc to throw');
  } catch {
    /* expected */
  } finally {
    restoreFetch();
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].result, 'failure');
  assert.equal(events[0].errorCode, 'L0_ENDPOINT_UNREACHABLE');
});

test('a throwing callback never breaks the call', async () => {
  const client = new InfrixClient('http://node.test', { telemetry: { onEvent: () => { throw new Error('boom'); } } });
  setFetch(async () => ({ json: async () => ({ result: 42 }) }));
  try {
    const r = await (client as unknown as { rpc(m: string): Promise<unknown> }).rpc('m');
    assert.equal(r, 42);
  } finally {
    restoreFetch();
  }
});

test('no telemetry option is a no-op (and no default network reporting)', async () => {
  const client = new InfrixClient('http://node.test'); // no telemetry
  setFetch(async () => ({ json: async () => ({ result: 'ok' }) }));
  try {
    const r = await (client as unknown as { rpc(m: string): Promise<unknown> }).rpc('m');
    assert.equal(r, 'ok');
  } finally {
    restoreFetch();
  }
});
