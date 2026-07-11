// Full-surface supply-chain guard (audit Z4). Runs the same class of release
// assertions the workspace guard runs — but over ALL eleven publishable packages
// (the eight workspace packages AND @infrix/client, @infrix/wallet, @infrix/sdk),
// using the shared enumeration in release-packages.mjs so it can never cover a
// different set than release-npm.mjs.
//
// For every package it validates the REAL published payload:
//   - MIT license;
//   - third-party deps are pinned (no ranges; @infrix/* siblings are exempt);
//   - the payload is non-empty;
//   - every file the manifest DECLARES via main/types/exports is present;
//   - package-specific required generated files are present;
//   - the unpacked payload is within the size budget.
//
// Payloads are proven FRESH (audit F1/G1): each package's generated output dirs are
// deleted, its own prepack/prepare is run explicitly (output captured), then it is
// packed with `npm pack --dry-run --json --ignore-scripts` so the JSON is never
// contaminated by lifecycle stdout. A package that cannot build its payload (e.g.
// @infrix/prover with no infrix-core source) fails closed here.
//
// Run: node scripts/supply-chain-all.mjs   (needs INFRIX_CORE_DIR for @infrix/prover)

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { repoRoot, loadPackages, GUARD_CONFIG, DEFAULT_BUDGET } from './release-packages.mjs';
import { assertTrustedNpm } from './npm-preflight.mjs';

// Pass-28 audit P1-7: this guard SPAWNS npm (`npm pack`), so its evidence is only
// trustworthy when the npm that runs is the trusted npm bundled with the Node
// install. Refuse to run on a host where a user-global npm diverges from it (the
// audit workstation's compromised %APPDATA%\npm). On such a host use the no-npm
// direct-node path (supply-chain-direct.mjs); the authoritative npm-pack manifest is
// produced by CI on a clean runner.
assertTrustedNpm();

const npm = 'npm';
const problems = [];
// Pass-23 audit P2-3: when --manifest <path> is passed, write the fresh
// per-package payload manifest (file list + unpacked size) so CI can ARCHIVE the
// authoritative supply-chain manifest for all 11 packages as a verified artifact.
const manifestIdx = process.argv.indexOf('--manifest');
const manifestPath = manifestIdx !== -1 ? process.argv[manifestIdx + 1] : null;
const manifest = { generatedFromNpmPack: true, packages: {} };

// Exercise each workspace package's own `build` once (npm resolves cross-package
// order) so sibling-importing checks (metamask/golden-escrow check.mjs) run with
// their deps present. Standalone packages build via their own prepack below.
try {
  execSync(`${npm} run build --workspaces --if-present`, { cwd: path.join(repoRoot, 'packages'), stdio: 'pipe' });
} catch (e) {
  const lines = `${e.stderr || ''}\n${e.stdout || ''}`.split('\n').map((l) => l.trim()).filter(Boolean);
  const errLines = lines.filter((l) => /err|error|failed|fatal/i.test(l));
  problems.push(`workspace build failed: ${(errLines.length ? errLines : lines).slice(-4).join(' | ') || e.message}`);
}

function declaredTargets(pkg) {
  const out = new Set();
  const add = (v) => {
    if (typeof v !== 'string') return;
    if (v.includes('*')) return;
    out.add(v.replace(/^\.\//, ''));
  };
  add(pkg.main);
  add(pkg.types);
  const walk = (e) => {
    if (typeof e === 'string') return add(e);
    if (e && typeof e === 'object') for (const v of Object.values(e)) walk(v);
  };
  walk(pkg.exports);
  return [...out];
}

// parsePackJson extracts the JSON array npm prints, defensively (audit G1).
function parsePackJson(raw) {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack --json produced no JSON array: ${raw.trim().split('\n')[0] || '(empty)'}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function packInfo(pkgDir) {
  execSync(`${npm} run prepack --if-present`, { cwd: pkgDir, stdio: 'pipe' });
  execSync(`${npm} run prepare --if-present`, { cwd: pkgDir, stdio: 'pipe' });
  const raw = execSync(`${npm} pack --dry-run --json --ignore-scripts`, { cwd: pkgDir, encoding: 'utf8' });
  const meta = parsePackJson(raw)[0] || {};
  const files = (meta.files || []).map((f) => f.path.replace(/\\/g, '/'));
  return { unpackedSize: meta.unpackedSize || 0, files };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
const packages = loadPackages().filter((p) => p.name);

for (const { dir, name, rel, pkg } of packages) {
  const cfg = GUARD_CONFIG[name] || {};

  if (pkg.license !== 'MIT') {
    problems.push(`${name}: license is ${pkg.license ?? '(none)'}, expected MIT`);
  }

  for (const [dep, range] of Object.entries(pkg.dependencies || {})) {
    if (dep.startsWith('@infrix/')) continue;
    if (/[\^~*><]|x/.test(range)) {
      problems.push(`${name}: dependency ${dep}@${range} is not pinned`);
    }
  }

  // Prove the payload fresh: purge generated dirs so prepack must rebuild them.
  for (const relGen of cfg.generated || []) {
    fs.rmSync(path.join(dir, relGen), { recursive: true, force: true });
  }

  let info;
  try {
    info = packInfo(dir);
  } catch (e) {
    problems.push(`${name}: npm pack failed (prepack could not produce the payload): ${e.message.split('\n')[0]}`);
    continue;
  }

  if (info.files.length <= 1) {
    problems.push(`${name}: published payload is empty (${info.files.length} file[s]) — only metadata would ship`);
  }

  for (const need of declaredTargets(pkg)) {
    if (!info.files.includes(need)) {
      problems.push(`${name}: package.json declares "${need}" but it is MISSING from the published payload`);
    }
  }

  for (const need of cfg.requiredFiles || []) {
    if (!info.files.includes(need)) {
      problems.push(`${name}: published payload is MISSING ${need} (would ship a broken package)`);
    }
  }

  const budget = cfg.budget ?? DEFAULT_BUDGET;
  if (info.unpackedSize > budget) {
    problems.push(`${name}: payload ${kb(info.unpackedSize)} exceeds budget ${kb(budget)}`);
  } else {
    console.log(`  ${name}: ${kb(info.unpackedSize)} / ${kb(budget)} — ${info.files.length} files — MIT — ok  (${rel})`);
  }

  manifest.packages[name] = {
    rel,
    version: pkg.version || null,
    unpackedSize: info.unpackedSize,
    budget,
    fileCount: info.files.length,
    files: info.files.slice().sort(),
  };
}

if (manifestPath) {
  manifest.packageCount = Object.keys(manifest.packages).length;
  manifest.expectedPackageCount = packages.length;
  manifest.complete = manifest.packageCount === packages.length;
  // Pass-24 audit P1-4: a release manifest MUST cover ALL packages. A partial
  // manifest (a package could not build its payload) is a supply-chain FAILURE —
  // no publish/release claim may be made from an incomplete manifest.
  //
  // Pass-25 audit P2-1: the AUTHORITATIVE manifest path is written ONLY when the
  // manifest is complete. An incomplete run never contaminates the authoritative
  // artifact with a partial payload set (which a later step could mistake for a
  // full one); instead the partial data is written to an explicitly-named
  // diagnostic path (<manifestPath>.partial) purely for triage, and the run fails.
  if (manifest.complete) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\nwrote COMPLETE supply-chain manifest for ${manifest.packageCount}/${packages.length} packages to ${manifestPath}`);
  } else {
    const diagnosticPath = `${manifestPath}.partial`;
    fs.writeFileSync(diagnosticPath, JSON.stringify(manifest, null, 2));
    console.error(
      `\nsupply-chain manifest is INCOMPLETE (${manifest.packageCount}/${packages.length} packages) — ` +
        `NOT writing the authoritative manifest ${manifestPath}; wrote a diagnostic partial to ${diagnosticPath}`,
    );
    problems.push(
      `supply-chain manifest is INCOMPLETE: ${manifest.packageCount}/${packages.length} packages — a release manifest must cover ALL ${packages.length} packages (diagnostic partial at ${diagnosticPath})`,
    );
  }
}

if (problems.length) {
  console.error('\nsupply-chain-all check FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`\nsupply-chain-all check passed: ${packages.length} packages, all MIT, all within size budget, all real payloads built and present.`);
