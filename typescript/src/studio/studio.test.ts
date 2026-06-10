/**
 * Visual Workflow Studio SDK tests (nextux-12).
 *
 * They verify the flow / simulation / export helpers against the Go-generated
 * studio fixture and assert the honesty invariants: a local flow is never
 * previewed as L4, a simulation never trusts the node and is never a live proof,
 * every export is validated, and generated SDK code never skips approval or
 * dry-run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  structuralIssues,
  isStructurallyValid,
  workflowActions,
  targetsMainnet,
  assuranceBadge,
  isHonest,
  previewsLiveProof,
  isSafeExport,
  generatedCodeIsSafe,
  EXPORT_FORMATS,
} from './index';
import type { Flow, Simulation, ExportResult, ValidationReport } from './index';

interface StudioFixture {
  version: number;
  flow: Flow;
  validation: ValidationReport;
  simulation: Simulation;
  palette: { group: string; items: unknown[] }[];
  exports: Record<string, ExportResult>;
}

function loadFixture(): StudioFixture {
  const p = join(__dirname, '..', '..', '..', '..', 'pkg', 'nexus', 'web', 'testdata', 'studio.fixture.json');
  return JSON.parse(readFileSync(p, 'utf8')) as StudioFixture;
}

test('the starter flow is structurally valid and grounded in real actions', () => {
  const { flow } = loadFixture();
  assert.ok(isStructurallyValid(flow), `flow has issues: ${structuralIssues(flow).join('; ')}`);
  assert.ok(!targetsMainnet(flow), 'a flow must never target mainnet');
  assert.ok(workflowActions(flow).length >= 1, 'the flow runs at least one governed action');
});

test('structuralIssues flags an ambiguous-authority approval', () => {
  const { flow } = loadFixture();
  const broken: Flow = JSON.parse(JSON.stringify(flow));
  for (const n of broken.nodes) if (n.kind === 'approval') n.actor = undefined;
  const issues = structuralIssues(broken);
  assert.ok(issues.some((i) => /ambiguous/.test(i)), `expected an ambiguous-authority issue: ${issues.join('; ')}`);
});

test('structuralIssues flags a workflow_action that would bypass execution', () => {
  const { flow } = loadFixture();
  const broken: Flow = JSON.parse(JSON.stringify(flow));
  for (const n of broken.nodes) if (n.kind === 'workflow_action') n.action = '';
  assert.ok(structuralIssues(broken).some((i) => /bypass canonical execution/.test(i)));
});

test('a local simulation never previews L4 and never trusts the node', () => {
  const { simulation } = loadFixture();
  assert.equal(simulation.simulated, true, 'a simulation must be marked simulated');
  assert.equal(simulation.nodeTrusted, false, 'a simulation must never trust the node');
  assert.equal(previewsLiveProof(simulation), false, 'a simulation is never a live proof');
  assert.notEqual(simulation.proofLevelCap, 'L4', 'a local flow must never preview L4');
  assert.equal(simulation.proofLevelCap, 'L3', 'a local governed proof caps at L3');
  assert.ok(isHonest(simulation), 'the simulation must satisfy the honesty invariants');
});

test('the assurance badge does not overclaim a live proof', () => {
  const { simulation } = loadFixture();
  const badge = assuranceBadge(simulation);
  assert.ok(!/fully verified/i.test(badge.label), `badge must not overclaim: ${badge.label}`);
  assert.match(badge.label, /simulated/i, 'the badge states it is a simulation');
});

test('every export is validated, safe, and carries a verifier command', () => {
  const { exports } = loadFixture();
  for (const format of EXPORT_FORMATS) {
    const res = exports[format];
    assert.ok(res, `missing export ${format}`);
    assert.ok(res.validation.valid, `export ${format} must be validated`);
    assert.ok(res.safety.mainnetDisabled, `export ${format} must disable mainnet`);
    assert.equal(res.safety.nodeTrusted, false, `export ${format} must not trust the node`);
    assert.ok(res.verifierCommand.trim().length > 0, `export ${format} must carry a verifier command`);
    assert.ok(res.docsLinks.length > 0, `export ${format} must carry docs links`);
    assert.ok(isSafeExport(res), `export ${format} must be safe`);
  }
});

test('the generated SDK snippet dry-runs and approves before it runs', () => {
  const { exports } = loadFixture();
  const code = exports['sdk-ts'].artifact;
  assert.ok(generatedCodeIsSafe(code), 'generated SDK must dry-run + approve before running and contain no bypass');
  assert.ok(code.includes('client.dryRun('), 'generated SDK must dry-run');
  assert.ok(code.includes('client.approve('), 'generated SDK must approve');
  assert.ok(/never 'mainnet'/.test(code), 'generated SDK must state it never targets mainnet');
});
