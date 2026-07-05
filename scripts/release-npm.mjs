// Release orchestration for every publishable @infrix/* npm package (sixth-pass
// audit S1/S3). ONE source of truth for the full npm surface, ONE no-write
// preflight, and an explicit plan-driven publish — so a release can never start
// blind, can never half-publish silently, and is safe to re-run.
//
// Package set (never drifts):
//   - the workspace packages, derived from packages/package.json `workspaces`
//     (the same list the supply-chain guard uses), and
//   - the three standalone public packages: typescript (@infrix/client),
//     typescript-wallet (@infrix/wallet), assemblyscript (@infrix/sdk).
//
// Release policy — PUBLISH-IF-ABSENT (explicit, per audit S1):
//   Each package is versioned independently. The registry is queried for every
//   package's EXACT name@version:
//     - absent    → it will be published;
//     - published → it is SKIPPED (idempotent — that version is already released);
//     - error     → registry unreachable / auth failure → the run FAILS CLOSED.
//   Because only absent versions are ever published, a publish can never fail on
//   an already-published version (the S1 failure mode), and re-running after a
//   partial failure simply resumes the packages that did not publish yet (the S3
//   split-release recovery path). To release a changed package, bump its version.
//
// Modes:
//   --preflight            no writes; compute the plan, query the registry, write
//                          the release manifest, fail closed on any registry error.
//   --dry-run              preflight, then `npm publish --dry-run` every package to
//                          validate the real built payload (no registry write).
//   --publish             preflight (fail closed on error), then `npm publish` each
//                          ABSENT package; skip already-published ones.
//   --manifest <path>      where to write the release manifest JSON
//                          (default: <repo>/release-manifest.json).
//
// @infrix/prover builds its WASM from infrix-core, so INFRIX_CORE_DIR must point at
// an infrix-core checkout for the prover payload to build (dry-run and publish).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const npm = 'npm';

const MODE = process.argv.includes('--publish')
  ? 'publish'
  : process.argv.includes('--dry-run')
    ? 'dry-run'
    : 'preflight';
const manifestPath = path.resolve(argValue('--manifest') || path.join(repoRoot, 'release-manifest.json'));

// Standalone public packages that live outside packages/ (audit S2).
const STANDALONE = ['typescript', 'typescript-wallet', 'assemblyscript'];

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// publishableDirs returns absolute package directories for the FULL npm surface:
// the workspace set (derived from packages/package.json so it can't drift) plus
// the three standalone packages.
function publishableDirs() {
  const wsRoot = path.join(repoRoot, 'packages');
  const ws = JSON.parse(fs.readFileSync(path.join(wsRoot, 'package.json'), 'utf8')).workspaces || [];
  const workspace = ws.map((w) => path.join(wsRoot, w));
  const standalone = STANDALONE.map((d) => path.join(repoRoot, d));
  return [...workspace, ...standalone];
}

// registryVersions returns { ok, versions } for a package name. A package that has
// never been published (registry 404) is reported as ok with an empty version list
// — that is a normal "absent" state, not an error. A network/auth failure is
// reported as { ok:false, reason } so the caller fails closed.
function registryVersions(name) {
  try {
    // Bound the registry probe so a slow/dead registry fails CLOSED fast instead of
    // hanging the release on npm's default retry backoff: cap fetch retries/timeout,
    // and put a hard per-call ceiling on execSync as a backstop. A timeout throws,
    // and its message is not an E404, so it is classified as an error (not "absent").
    const out = execSync(
      `${npm} view ${name} versions --json --fetch-retries=2 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=15000`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }
    );
    const v = JSON.parse(out || 'null');
    const versions = Array.isArray(v) ? v : v ? [v] : [];
    return { ok: true, versions };
  } catch (e) {
    const err = `${e.stderr || ''}${e.stdout || ''}`;
    // A genuine "package/version not on the registry" is a 404 — that is ABSENT, a
    // normal state. Anything else (network, DNS, auth, timeout) is an ERROR that
    // must fail the preflight, never be mistaken for absent.
    if (/E404|404/i.test(err)) return { ok: true, versions: [] };
    const why = e.killed || e.signal ? `registry probe timed out` : err.trim().split('\n')[0] || e.message || 'npm view failed';
    return { ok: false, reason: why.slice(0, 300) };
  }
}

// Build the release plan: one entry per package with its registry status.
function computePlan() {
  const plan = [];
  const seen = new Map();
  for (const dir of publishableDirs()) {
    const rel = path.relative(repoRoot, dir).replace(/\\/g, '/');
    const pjPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pjPath)) {
      plan.push({ dir: rel, name: null, version: null, status: 'error', reason: 'no package.json' });
      continue;
    }
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    if (pj.private) continue; // never publish a private package
    if (!pj.name || !pj.version) {
      plan.push({ dir: rel, name: pj.name || null, version: pj.version || null, status: 'error', reason: 'missing name/version' });
      continue;
    }
    if (seen.has(pj.name)) {
      plan.push({ dir: rel, name: pj.name, version: pj.version, status: 'error', reason: `duplicate package name (also ${seen.get(pj.name)})` });
      continue;
    }
    seen.set(pj.name, rel);
    const reg = registryVersions(pj.name);
    if (!reg.ok) {
      plan.push({ dir: rel, name: pj.name, version: pj.version, status: 'error', reason: reg.reason });
    } else {
      const status = reg.versions.includes(pj.version) ? 'published' : 'absent';
      plan.push({ dir: rel, name: pj.name, version: pj.version, status });
    }
  }
  return plan;
}

function writeManifest(plan) {
  const manifest = {
    policy: 'publish-if-absent',
    mode: MODE,
    generatedAt: new Date().toISOString(),
    packages: plan,
    summary: summarize(plan),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`release manifest written: ${manifestPath}`);
}

function summarize(plan) {
  const by = (s) => plan.filter((p) => p.status === s).length;
  return { total: plan.length, absent: by('absent'), published: by('published'), error: by('error') };
}

function printPlan(plan) {
  console.log(`\nrelease plan (policy: publish-if-absent, mode: ${MODE}):`);
  for (const p of plan) {
    const tag = p.status === 'absent' ? 'PUBLISH ' : p.status === 'published' ? 'skip    ' : 'ERROR   ';
    const extra = p.reason ? `  — ${p.reason}` : '';
    console.log(`  ${tag} ${(p.name || p.dir).padEnd(30)} ${String(p.version || '')}  (${p.dir})${extra}`);
  }
  const s = summarize(plan);
  console.log(`\n  ${s.absent} to publish, ${s.published} already published, ${s.error} error(s), ${s.total} total.`);
}

// runIn runs a command in a package dir, streaming output; throws on failure.
function runIn(dir, cmd) {
  execSync(cmd, { cwd: path.join(repoRoot, dir), stdio: 'inherit', env: process.env });
}

const plan = computePlan();
printPlan(plan);
writeManifest(plan);

const errors = plan.filter((p) => p.status === 'error');

if (MODE === 'preflight') {
  if (errors.length) {
    console.error(`\npreflight FAILED: ${errors.length} package(s) could not be resolved against the registry.`);
    process.exit(1);
  }
  const toPublish = plan.filter((p) => p.status === 'absent');
  if (!toPublish.length) {
    console.log('\npreflight OK: nothing to publish — every intended version is already on the registry.');
  } else {
    console.log(`\npreflight OK: ${toPublish.length} package(s) ready to publish.`);
  }
  process.exit(0);
}

if (MODE === 'dry-run') {
  // Validate the real built payload of EVERY package (registry errors are only a
  // warning here — the dry-run's job is payload validation, not the release gate).
  if (errors.length) {
    console.warn(`\nnote: ${errors.length} package(s) had registry errors; dry-run validates payloads regardless.`);
  }
  const failures = [];
  for (const p of plan.filter((x) => x.name)) {
    console.log(`\n--- dry-run publish ${p.name} (${p.dir}) ---`);
    try {
      runIn(p.dir, `${npm} publish --dry-run --provenance=false`);
    } catch (e) {
      failures.push(`${p.name}: ${e.message.split('\n')[0]}`);
    }
  }
  if (failures.length) {
    console.error('\ndry-run FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('\ndry-run OK: all package payloads built and packable.');
  process.exit(0);
}

// MODE === 'publish' — fail closed on any registry error, then publish only the
// absent versions (idempotent; a re-run resumes any that did not publish).
if (errors.length) {
  console.error(`\npublish ABORTED before any write: ${errors.length} package(s) could not be resolved against the registry:`);
  for (const e of errors) console.error(`  - ${e.name || e.dir}: ${e.reason}`);
  process.exit(1);
}

const toPublish = plan.filter((p) => p.status === 'absent');
if (!toPublish.length) {
  console.log('\nnothing to publish — every intended version is already on the registry. No-op.');
  process.exit(0);
}

const published = [];
const failed = [];
for (const p of toPublish) {
  console.log(`\n--- publish ${p.name}@${p.version} (${p.dir}) ---`);
  try {
    runIn(p.dir, `${npm} publish`);
    published.push(p.name);
    p.result = 'published';
  } catch (e) {
    failed.push(`${p.name}: ${e.message.split('\n')[0]}`);
    p.result = 'failed';
    // Stop on the first failure so the outcome is unambiguous; the remaining
    // absent packages stay unpublished and a re-run resumes them.
    break;
  }
}
// Record post-publish outcomes for the release record.
writeManifest(plan);

console.log(`\npublished ${published.length}/${toPublish.length}: ${published.join(', ') || '(none)'}`);
if (failed.length) {
  console.error('\npublish FAILED (re-run to resume the remaining packages):');
  for (const f of failed) console.error('  - ' + f);
  const remaining = toPublish.filter((p) => p.result !== 'published').map((p) => p.name);
  console.error(`  not yet published: ${remaining.join(', ')}`);
  process.exit(1);
}
console.log('\npublish OK: all absent packages published with provenance.');
