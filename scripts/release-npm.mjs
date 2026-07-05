// Release orchestration for every publishable @infrix/* npm package (sixth-pass
// audit S1/S3; seventh-pass Z1/Z6). ONE source of truth for the full npm surface
// (scripts/release-packages.mjs), ONE registry preflight, and an explicit
// plan-driven publish — so a release can never start blind, can never half-publish
// silently, can never silently skip a locally-changed package, and is safe to
// re-run.
//
// Release policy — PUBLISH-IF-ABSENT with a payload-identity guard:
//   Each package is versioned independently. For every package's EXACT name@version:
//     - absent              → it will be published;
//     - published-same      → SKIPPED (that version is already released, and the
//                             local payload byte-for-byte matches the registry);
//     - published-different → FAILS the release (audit Z1): the local payload
//                             differs from what is on the registry for this exact
//                             version, so a green release would silently NOT ship
//                             the local change. Bump the version to ship it, or
//                             revert the local change.
//     - error               → registry unreachable / auth failure → FAILS CLOSED.
//   Only absent versions are ever published, so a publish can never fail on an
//   already-published version and a re-run resumes a partial release.
//
// Payload identity (audit Z1): for a published version, the local tarball shasum
// (from `npm pack --dry-run --json`, built via the package's real prepack) is
// compared to the registry `dist.shasum`. CI pins npm, so this is apples-to-apples.
//
// Modes:
//   --preflight     no writes; registry plan + payload-identity check; fail closed
//                   on any error or published-different; write the release manifest.
//   --dry-run       release-readiness: preflight gate (fails on error /
//                   published-different), THEN `npm publish --dry-run` every package.
//   --payload-only  registry-INDEPENDENT: only build+pack every package (no registry
//                   query, no readiness gate). Use to validate packability offline.
//   --publish       preflight gate, then `npm publish` each ABSENT package; skip
//                   published-same.
//   --manifest <p>  where to write the release manifest JSON
//                   (default: <repo>/release-manifest.json).
//
// @infrix/prover builds its WASM from infrix-core, so INFRIX_CORE_DIR must point at
// an infrix-core checkout for the prover payload to build.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { repoRoot, packageDirs } from './release-packages.mjs';

const npm = 'npm';

const MODE = process.argv.includes('--publish')
  ? 'publish'
  : process.argv.includes('--payload-only')
    ? 'payload-only'
    : process.argv.includes('--dry-run')
      ? 'dry-run'
      : 'preflight';
const manifestPath = path.resolve(argValue('--manifest') || path.join(repoRoot, 'release-manifest.json'));

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// parsePackJson extracts the JSON array `npm pack --json` prints, defensively
// (a stray notice on stdout can never break it — audit G1).
function parsePackJson(raw) {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack --json produced no JSON array: ${raw.trim().split('\n')[0] || '(empty)'}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

// registryVersions returns { ok, versions } for a package name. A 404 (never
// published) is ok with an empty version list — a normal "absent" state. A
// network/auth/timeout failure is { ok:false } so the caller fails closed. The
// probe is bounded so a slow/dead registry fails fast instead of hanging.
function registryVersions(name) {
  try {
    const out = execSync(
      `${npm} view ${name} versions --json --fetch-retries=2 --fetch-retry-mintimeout=1000 --fetch-retry-maxtimeout=15000`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }
    );
    const v = JSON.parse(out || 'null');
    const versions = Array.isArray(v) ? v : v ? [v] : [];
    return { ok: true, versions };
  } catch (e) {
    const err = `${e.stderr || ''}${e.stdout || ''}`;
    if (/E404|404/i.test(err)) return { ok: true, versions: [] };
    const why = e.killed || e.signal ? 'registry probe timed out' : err.trim().split('\n')[0] || e.message || 'npm view failed';
    return { ok: false, reason: why.slice(0, 300) };
  }
}

// registryShasum returns the registry's tarball dist.shasum for an exact
// name@version, or null if it cannot be read.
function registryShasum(name, version) {
  try {
    const out = execSync(
      `${npm} view ${name}@${version} dist.shasum --json --fetch-retries=2 --fetch-retry-maxtimeout=15000`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }
    );
    const v = JSON.parse(out || 'null');
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length) return v[v.length - 1]; // exact version → single
    return null;
  } catch {
    return null;
  }
}

// packShasum builds the package (its real prepack/prepare) and returns the shasum
// of the tarball `npm publish` would produce — the local payload identity.
function packShasum(dir) {
  execSync(`${npm} run prepack --if-present`, { cwd: dir, stdio: 'pipe' });
  execSync(`${npm} run prepare --if-present`, { cwd: dir, stdio: 'pipe' });
  const raw = execSync(`${npm} pack --dry-run --json --ignore-scripts`, { cwd: dir, encoding: 'utf8' });
  const meta = parsePackJson(raw)[0] || {};
  return meta.shasum || null;
}

// computePlan classifies every package against the registry (absent/published/error).
function computePlan() {
  const plan = [];
  const seen = new Map();
  for (const dir of packageDirs()) {
    const rel = path.relative(repoRoot, dir).replace(/\\/g, '/');
    const pjPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pjPath)) {
      plan.push({ dir, rel, name: null, version: null, status: 'error', reason: 'no package.json' });
      continue;
    }
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    if (pj.private) continue;
    if (!pj.name || !pj.version) {
      plan.push({ dir, rel, name: pj.name || null, version: pj.version || null, status: 'error', reason: 'missing name/version' });
      continue;
    }
    if (seen.has(pj.name)) {
      plan.push({ dir, rel, name: pj.name, version: pj.version, status: 'error', reason: `duplicate package name (also ${seen.get(pj.name)})` });
      continue;
    }
    seen.set(pj.name, rel);
    const reg = registryVersions(pj.name);
    if (!reg.ok) {
      plan.push({ dir, rel, name: pj.name, version: pj.version, status: 'error', reason: reg.reason });
    } else {
      const status = reg.versions.includes(pj.version) ? 'published' : 'absent';
      plan.push({ dir, rel, name: pj.name, version: pj.version, status });
    }
  }
  return plan;
}

// annotatePayloads resolves each `published` entry to published-same or
// published-different by comparing the local built tarball shasum to the registry
// shasum (audit Z1), recording both on the entry.
function annotatePayloads(plan) {
  for (const p of plan) {
    if (p.status !== 'published') continue;
    p.registryShasum = registryShasum(p.name, p.version);
    try {
      p.localShasum = packShasum(p.dir);
    } catch (e) {
      p.status = 'error';
      p.reason = `could not build local payload for comparison: ${e.message.split('\n')[0]}`;
      continue;
    }
    if (!p.registryShasum || !p.localShasum) {
      p.status = 'error';
      p.reason = 'could not resolve registry/local shasum for payload comparison';
      p.payloadMatchesRegistry = null;
      continue;
    }
    p.payloadMatchesRegistry = p.registryShasum === p.localShasum;
    p.status = p.payloadMatchesRegistry ? 'published-same' : 'published-different';
  }
  return plan;
}

function summarize(plan) {
  const by = (s) => plan.filter((p) => p.status === s).length;
  return {
    total: plan.length,
    absent: by('absent'),
    publishedSame: by('published-same'),
    publishedDifferent: by('published-different'),
    published: by('published'),
    error: by('error'),
  };
}

function writeManifest(plan) {
  const manifest = {
    policy: 'publish-if-absent',
    mode: MODE,
    generatedAt: new Date().toISOString(),
    packages: plan.map((p) => ({
      dir: p.rel,
      name: p.name,
      version: p.version,
      status: p.status,
      ...(p.reason ? { reason: p.reason } : {}),
      ...(p.registryShasum !== undefined ? { registryShasum: p.registryShasum } : {}),
      ...(p.localShasum !== undefined ? { localShasum: p.localShasum } : {}),
      ...(p.payloadMatchesRegistry !== undefined ? { payloadMatchesRegistry: p.payloadMatchesRegistry } : {}),
      ...(p.result ? { result: p.result } : {}),
    })),
    summary: summarize(plan),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`release manifest written: ${manifestPath}`);
}

function printPlan(plan) {
  console.log(`\nrelease plan (policy: publish-if-absent, mode: ${MODE}):`);
  const tagFor = (s) =>
    s === 'absent' ? 'PUBLISH ' :
    s === 'published-same' ? 'skip    ' :
    s === 'published-different' ? 'CHANGED ' :
    s === 'published' ? 'skip?   ' : 'ERROR   ';
  for (const p of plan) {
    const extra = p.reason ? `  — ${p.reason}` : '';
    console.log(`  ${tagFor(p.status)} ${(p.name || p.rel).padEnd(30)} ${String(p.version || '')}  (${p.rel})${extra}`);
  }
  const s = summarize(plan);
  console.log(
    `\n  ${s.absent} to publish, ${s.publishedSame} already published (identical), ` +
    `${s.publishedDifferent} CHANGED but version already published, ${s.error} error(s), ${s.total} total.`
  );
}

// runIn runs a command in a package dir, streaming output; throws on failure.
function runIn(dir, cmd) {
  execSync(cmd, { cwd: dir, stdio: 'inherit', env: process.env });
}

// ---- payload-only: registry-independent packing (audit Z6) ----
if (MODE === 'payload-only') {
  const failures = [];
  const dirs = packageDirs();
  for (const dir of dirs) {
    const rel = path.relative(repoRoot, dir).replace(/\\/g, '/');
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (pj.private) continue;
    console.log(`\n--- pack ${pj.name} (${rel}) ---`);
    try {
      runIn(dir, `${npm} publish --dry-run --provenance=false`);
    } catch (e) {
      failures.push(`${pj.name}: ${e.message.split('\n')[0]}`);
    }
  }
  if (failures.length) {
    console.error('\npayload-only FAILED:');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
  }
  console.log('\npayload-only OK: all package payloads built and packable (registry state NOT checked).');
  process.exit(0);
}

// ---- registry-aware modes: preflight / dry-run / publish ----
const plan = annotatePayloads(computePlan());
printPlan(plan);
writeManifest(plan);

const errors = plan.filter((p) => p.status === 'error');
const changed = plan.filter((p) => p.status === 'published-different');

// The shared release-readiness gate (audit Z1/Z6): registry must be resolvable AND
// no locally-changed package may sit on top of an already-published version.
function assertReleaseReady(context) {
  let bad = false;
  if (errors.length) {
    console.error(`\n${context} FAILED: ${errors.length} package(s) could not be resolved against the registry:`);
    for (const e of errors) console.error(`  - ${e.name || e.rel}: ${e.reason}`);
    bad = true;
  }
  if (changed.length) {
    console.error(
      `\n${context} FAILED: ${changed.length} package(s) have local changes but their version is already published:`
    );
    for (const p of changed) {
      console.error(`  - ${p.name}@${p.version}: local payload ${p.localShasum} != registry ${p.registryShasum}`);
    }
    console.error('  Bump each package version to ship the change, or revert the local payload change.');
    bad = true;
  }
  if (bad) process.exit(1);
}

if (MODE === 'preflight') {
  assertReleaseReady('preflight');
  const toPublish = plan.filter((p) => p.status === 'absent');
  console.log(
    toPublish.length
      ? `\npreflight OK: ${toPublish.length} package(s) ready to publish.`
      : '\npreflight OK: nothing to publish — every intended version is already on the registry and identical.'
  );
  process.exit(0);
}

if (MODE === 'dry-run') {
  assertReleaseReady('dry-run');
  const failures = [];
  for (const p of plan.filter((x) => x.name)) {
    console.log(`\n--- dry-run publish ${p.name} (${p.rel}) ---`);
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
  console.log('\ndry-run OK: release-ready and all package payloads built and packable.');
  process.exit(0);
}

// MODE === 'publish'
assertReleaseReady('publish');

const toPublish = plan.filter((p) => p.status === 'absent');
if (!toPublish.length) {
  console.log('\nnothing to publish — every intended version is already on the registry and identical. No-op.');
  process.exit(0);
}

const published = [];
const failed = [];
for (const p of toPublish) {
  console.log(`\n--- publish ${p.name}@${p.version} (${p.rel}) ---`);
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
