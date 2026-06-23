/**
 * Migration & Comparison Lab SDK tests (nextux-15).
 *
 * They verify the report / scaffold helpers against the Go-generated compare
 * fixture and assert the honesty invariants: every external claim is sourced or
 * an assumption, every Infrix claim is backed, every cost line carries a basis
 * (no invented numbers), and the worked report passes the honesty rails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isExternalClaim,
  claimSourced,
  costGrounded,
  reportIsHonest,
  generatedSdkIsSafe,
} from './index';
import type { Report } from './index';

interface CompareFixture {
  version: number;
  patterns: { id: string; title: string; infrixEquivalent: string }[];
  report: Report;
  capabilities: string[];
}

function loadFixture(): CompareFixture {
  const p = join(__dirname, '..', '..', 'testdata', 'compare.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as CompareFixture;
}

test('the catalog carries the eight patterns, each mapped to an Infrix equivalent', () => {
  const { patterns } = loadFixture();
  assert.equal(patterns.length, 8, 'eight patterns');
  for (const p of patterns) {
    assert.ok(p.infrixEquivalent.length > 0, `pattern ${p.id} maps to an Infrix equivalent`);
  }
});

test('every external claim is sourced/dated or an assumption; every Infrix claim is backed', () => {
  const { report } = loadFixture();
  for (const c of report.claims) {
    assert.equal(claimSourced(c), true, `claim is grounded: ${c.text}`);
    if (isExternalClaim(c)) {
      assert.ok(c.source, `external claim has a source: ${c.text}`);
      assert.ok(c.source!.assumption || c.source!.date, `external claim is dated or an assumption: ${c.text}`);
    } else {
      assert.ok(c.backedBy, `Infrix claim is backed: ${c.text}`);
    }
  }
});

test('every cost line carries a basis (no invented numbers)', () => {
  const { report } = loadFixture();
  assert.ok(report.costComparison.length >= 1);
  for (const cost of report.costComparison) {
    assert.ok(cost.basis, `cost ${cost.label} has a basis`);
    assert.equal(costGrounded(cost), true, `cost ${cost.label} is grounded`);
  }
});

test('the worked report satisfies the honesty rails and maps to a real scenario', () => {
  const { report } = loadFixture();
  assert.equal(reportIsHonest(report), true, 'the report is honest');
  assert.equal(report.infrixEquivalent, 'regulated-escrow');
});

test('a generated SDK starter that runs before approving is rejected', () => {
  const safe = [
    "await client.dryRun('x', {});",
    "const a = await client.approve('x', {});",
    "await client.run('x', {}, { approval: a });",
  ].join('\n');
  assert.equal(generatedSdkIsSafe(safe), true, 'a dry-run-then-approve-then-run snippet is safe');

  const unsafe = "await client.run('x', {}); await client.dryRun('x', {}); await client.approve('x', {});";
  assert.equal(generatedSdkIsSafe(unsafe), false, 'a run-before-dry-run snippet is rejected');

  const mainnet = [
    "await client.dryRun('x', { mode: 'mainnet' });",
    "await client.approve('x', {});",
    "await client.run('x', {});",
  ].join('\n');
  assert.equal(generatedSdkIsSafe(mainnet), false, 'a mainnet snippet is rejected');
});
