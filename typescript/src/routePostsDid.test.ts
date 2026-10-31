// The SDK's call of the node's read-only did:infrix verdict route, POST /v4/did/check. The test holds the REQUEST to what the route accepts (verb,
// path, only the body fields it declares: docs/release/census/rest-body-fields.txt in the node repository) and the RESULT to what the route answers
// (rest-response-shapes.txt), against a mocked fetch. A refusal is a clean answer (verified=false and the typed reason), not a thrown error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InfrixClient } from './index';

type FetchLike = (...args: unknown[]) => Promise<unknown>;
const realFetch = (globalThis as { fetch?: FetchLike }).fetch;

interface Seen {
  method?: string;
  path: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

async function against<T>(data: unknown, fn: (c: InfrixClient) => Promise<T>): Promise<{ seen: Seen; result: T }> {
  const seen: Seen = { path: '', headers: {} };
  (globalThis as { fetch?: FetchLike }).fetch = async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string };
    seen.method = i.method;
    seen.path = new URL(String(url)).pathname;
    seen.headers = i.headers ?? {};
    seen.body = i.body ? JSON.parse(i.body) : undefined;
    const payload = { data };
    return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
  };
  try {
    const result = await fn(new InfrixClient('http://node.test', { actor: 'acc://reader.acme', purpose: 'audit' }));
    return { seen, result };
  } finally {
    (globalThis as { fetch?: FetchLike }).fetch = realFetch;
  }
}

test('didCheck.check POSTs the check and its input and returns the verdict the route answers', async () => {
  const did = 'did:infrix:v1:acc:g1-e3f3119213a1ead44647659d67e47f4269a2affb13f150aa87b20baacf93cf81:alice.acme';
  const answer = { check: 'inspect', verified: true, fields: { canonical: did, profile: 'acc' } };
  const r = await against(answer, (c) => c.didCheck.check({ check: 'inspect', did }));
  assert.equal(r.seen.method, 'POST');
  assert.equal(r.seen.path, '/v4/did/check');
  assert.deepEqual(r.seen.body, { check: 'inspect', did }, 'only the members the caller gave are sent, none of the route-declared members it did not');
  assert.equal(r.seen.headers['X-Actor'], 'acc://reader.acme');
  assert.equal(r.result.verified, true);
  assert.equal(r.result.fields?.profile, 'acc');
});

test('didCheck.check returns a refusal as a verdict, with its typed reason, and sends an artifact as the exact base64 the route decodes', async () => {
  const answer = { check: 'storage-history', verified: false, reason: 'storage-refused', error: 'the history is corrupt' };
  const artifact = Buffer.from('{"account":"acc://alice.acme/did"}').toString('base64');
  const r = await against(answer, (c) => c.didCheck.check({ check: 'storage-history', artifact }));
  assert.deepEqual(r.seen.body, { check: 'storage-history', artifact });
  assert.equal(r.result.verified, false);
  assert.equal(r.result.reason, 'storage-refused');
  assert.equal(r.result.error, 'the history is corrupt');
});
