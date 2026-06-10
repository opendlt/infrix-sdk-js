/**
 * Zero-Context Local Companion SDK tests (nextux-10).
 *
 * They verify the honest context helpers against the Go-generated fixture and a
 * mocked companion client (the companion is localhost-only; the client never
 * talks to a third party).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  statusWords,
  counts,
  resumeLine,
  isReadOnlyActions,
  InfrixCompanionClient,
} from './index';
import type { CompanionContext, CompanionFetch } from './index';

function loadFixture(): CompanionContext {
  // The canonical companion context fixture shared with Nexus.
  const p = join(__dirname, '..', '..', '..', '..', 'pkg', 'nexus', 'web', 'testdata', 'companion.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as CompanionContext;
}

test('the context helpers are honest about verification', () => {
  const ctx = loadFixture();
  assert.equal(statusWords('unverified'), 'not verified yet');
  assert.equal(statusWords('verified'), 'verified');
  const c = counts(ctx.recentArtifacts);
  assert.ok(c.total >= 3);
  assert.ok(c.verified >= 1 && c.unverified >= 1, 'fixture has both verified and not-yet-verified artifacts');
  assert.match(resumeLine(ctx.recentArtifacts), /You were working on/);
});

test('the allowed actions are read-only', () => {
  const ctx = loadFixture();
  assert.equal(isReadOnlyActions(ctx.allowedActions), true);
});

test('every suggestion is complete and write-suggestions need approval', () => {
  const ctx = loadFixture();
  for (const s of ctx.suggestions) {
    assert.ok(s.title && s.reason && s.command && s.docs, `incomplete: ${JSON.stringify(s)}`);
    if (s.riskLevel === 'local_write') assert.equal(s.needsApproval, true);
  }
});

function mockFetch(routes: Record<string, unknown>): CompanionFetch {
  return async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const body = routes[key];
    return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => body };
  };
}

test('the client reads context, artifacts, suggestions, and resolves open', async () => {
  const ctx = loadFixture();
  const client = new InfrixCompanionClient({
    baseUrl: 'http://127.0.0.1:8765',
    fetchImpl: mockFetch({
      'GET /v1/companion/context': ctx,
      'GET /v1/companion/artifacts': { artifacts: ctx.recentArtifacts },
      'GET /v1/companion/suggestions': { suggestions: ctx.suggestions },
      'POST /v1/companion/open': { route: '#/execute', url: '/#/execute' },
    }),
  });

  const got = await client.context();
  assert.equal(got.branch, ctx.branch);
  assert.equal((await client.recentArtifacts()).length, ctx.recentArtifacts.length);
  assert.equal((await client.suggestions()).length, ctx.suggestions.length);
  const opened = await client.open('#/execute');
  assert.equal(opened.route, '#/execute');
});
