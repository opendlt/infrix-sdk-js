// Supply-chain checks for the adoption-10 happy-path packages:
//   - the package set is derived from packages/package.json `workspaces` (never a
//     hardcoded list that drifts — second-pass/third-pass audit T2);
//   - every package is MIT-licensed;
//   - every package declares pinned (no-range) third-party deps, if any;
//   - every package's ACTUAL published payload is inspected against the REAL
//     tarball that `npm publish` would produce (see "Faithful payloads" below),
//     so a package that would publish without its generated artifacts (e.g.
//     @infrix/prover with no WASM, or @infrix/widgets with no compiled dist/) is
//     caught here, not by a consumer;
//   - every file a package DECLARES in `main`/`types`/`exports`, plus each
//     package's explicit REQUIRED_FILES, is actually present in that tarball.
//
// Faithful payloads (fourth-pass audit F1):
//   The previous guard packed with `--ignore-scripts` and only ran vendor/check
//   by hand, so build-output packages (widgets, widgets-webcomponent) validated a
//   metadata-only tarball from a clean checkout while reporting success, and the
//   result was stateful (a dirty tree with stale dist/ passed stronger than a
//   clean CI tree). This guard instead:
//     1. deletes each package's untracked generated output dirs FIRST (GENERATED),
//        so the payload is proven to come from a fresh build — never stale
//        artifacts left in a dirty working tree;
//     2. produces the payload the way `npm publish` does — every package is packed
//        WITHOUT `--ignore-scripts`, so npm runs its real prepare/prepack (tsc,
//        vendoring, asset generation) exactly as publication would. Packages with
//        no prepack simply tar their committed files, which IS their real payload.
//   A whole-workspace `npm run build` runs once up front (npm resolves the
//   cross-package build order) so each package's own `build` — including the
//   metamask/golden-escrow API-surface `check.mjs` — is exercised with its sibling
//   deps present; a build failure is a finding.
//
// Run: node scripts/supply-chain.mjs   (or: npm run check:supply-chain)
// Exits non-zero on any violation.
//
// Note: run this where each package can produce its published files (for
// @infrix/prover that means an infrix-core checkout via INFRIX_CORE_DIR); a
// missing-asset package is a real supply-chain finding, not a skip.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Derive the package set from the workspace manifest so it can never drift.
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const PACKAGES = (rootPkg.workspaces || []).slice().sort();

// Per-package published-size budgets (bytes), measured against the real
// npm-pack unpackedSize. @infrix/prover carries the ~17 MB gnark WASM, so it
// gets a budget matching infrix-core's WASM ceiling (26,214,400 B = 25 MiB).
const BUDGET = {
  'verify': 256 * 1024,
  'proof-receipt': 256 * 1024,
  'widgets': 512 * 1024,
  'widgets-webcomponent': 512 * 1024,
  'metamask': 64 * 1024,
  'golden-escrow': 64 * 1024,
  'templates': 64 * 1024,
  'prover': 26 * 1024 * 1024,
};
const DEFAULT_BUDGET = 512 * 1024;

// Generated files a package MUST ship that are NOT declared in main/types/exports
// (audit rec #2). main/types/exports targets are checked generically below; these
// cover the compiled/vendored artifacts a consumer needs but that the manifest
// does not name directly.
const REQUIRED_FILES = {
  'prover': ['assets/infrix-prover.wasm', 'assets/manifest.json', 'assets/wasm_exec.js'],
  'widgets': ['dist/index.js', 'dist/index.d.ts', 'styles.css'],
  'widgets-webcomponent': ['dist/index.js', 'dist/index.d.ts', 'dist/infrix-widgets.js'],
};

// Untracked build-output directories each package's build/prepack regenerates.
// We delete these BEFORE packing so the inspected tarball is proven to come from
// a fresh build, not from stale artifacts in a dirty tree (audit F1: the guard
// was stateful). Only untracked, fully-generated dirs are listed here — never a
// committed source dir.
const GENERATED = {
  'proof-receipt': ['vendor'],
  'widgets': ['dist'],
  'widgets-webcomponent': ['dist'],
  'prover': ['assets'],
};

const problems = [];
const npm = process.platform === 'win32' ? 'npm' : 'npm'; // execSync uses the shell → .cmd resolves

// Build every workspace once, in npm's cross-package order, so each package's own
// `build` (e.g. the metamask/golden-escrow API-surface check.mjs, which imports a
// sibling package) runs with its dependencies present. This is a DX/validation
// pass; the per-package payload inspection below is the authoritative check and
// re-generates each prepack package's output from scratch regardless.
try {
  execSync(`${npm} run build --workspaces --if-present`, { cwd: root, stdio: 'pipe' });
} catch (e) {
  const lines = `${e.stderr || ''}\n${e.stdout || ''}`
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer the npm error lines (which name the failing workspace) over generic
  // success chatter from workspaces that built before the failure.
  const errLines = lines.filter((l) => /err|error|failed|fatal/i.test(l));
  const tail = (errLines.length ? errLines : lines).slice(-4).join(' | ');
  problems.push(`workspace build failed: ${tail || e.message}`);
}

// declaredTargets returns every concrete file a package.json declares as part of
// its public surface via main/types/exports (leading "./" stripped, wildcard
// subpath exports skipped). Each must exist in the real published tarball.
function declaredTargets(pkg) {
  const out = new Set();
  const add = (v) => {
    if (typeof v !== 'string') return;
    if (v.includes('*')) return; // wildcard subpath export — not a concrete file
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

// packInfo returns { unpackedSize, files[] } for a package's real tarball. It
// does NOT pass --ignore-scripts: npm runs the package's own prepare/prepack
// exactly as `npm publish` would, so the reported contents are the true
// publishable payload (dist/*, vendored deps, generated assets).
function packInfo(pkgDir) {
  const raw = execSync(`${npm} pack --dry-run --json`, { cwd: pkgDir, encoding: 'utf8' });
  const meta = JSON.parse(raw)[0] || {};
  const files = (meta.files || []).map((f) => f.path.replace(/\\/g, '/'));
  return { unpackedSize: meta.unpackedSize || 0, files };
}

for (const name of PACKAGES) {
  const pkgDir = path.join(root, name);
  const pkgJsonPath = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    problems.push(`${name}: listed in workspaces but has no package.json`);
    continue;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

  // License.
  if (pkg.license !== 'MIT') {
    problems.push(`${name}: license is ${pkg.license ?? '(none)'}, expected MIT`);
  }

  // Pinned third-party deps (workspace @infrix/* siblings are allowed ranges).
  for (const [dep, range] of Object.entries(pkg.dependencies || {})) {
    if (dep.startsWith('@infrix/')) continue;
    if (/[\^~*><]|x/.test(range)) {
      problems.push(`${name}: dependency ${dep}@${range} is not pinned`);
    }
  }

  // Defeat statefulness: remove this package's generated build outputs so the
  // tarball below is proven fresh. A prepack/build that cannot rebuild them
  // (e.g. @infrix/prover with no infrix-core source) then fails closed.
  for (const rel of GENERATED[name] || []) {
    fs.rmSync(path.join(pkgDir, rel), { recursive: true, force: true });
  }

  // Inspect the REAL tarball (npm runs the package's own prepack).
  let info;
  try {
    info = packInfo(pkgDir);
  } catch (e) {
    problems.push(`${name}: npm pack failed (prepack could not produce the publishable payload): ${e.message.split('\n')[0]}`);
    continue;
  }

  // A published package must carry more than just package.json.
  if (info.files.length <= 1) {
    problems.push(`${name}: published payload is empty (${info.files.length} file[s]) — nothing but metadata would ship`);
  }

  // Everything the manifest declares (main/types/exports) must actually ship.
  for (const need of declaredTargets(pkg)) {
    if (!info.files.includes(need)) {
      problems.push(`${name}: package.json declares "${need}" but it is MISSING from the published payload`);
    }
  }

  // Required generated files (e.g. prover WASM assets, compiled dist entry points).
  for (const need of REQUIRED_FILES[name] || []) {
    if (!info.files.includes(need)) {
      problems.push(`${name}: published payload is MISSING ${need} (would ship a broken package)`);
    }
  }

  // Size budget against the real unpacked payload.
  const budget = BUDGET[name] ?? DEFAULT_BUDGET;
  const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
  if (info.unpackedSize > budget) {
    problems.push(`${name}: payload ${kb(info.unpackedSize)} exceeds budget ${kb(budget)}`);
  } else {
    console.log(`  ${name}: ${kb(info.unpackedSize)} / ${kb(budget)} — ${info.files.length} files — MIT — ok`);
  }
}

if (problems.length) {
  console.error('\nsupply-chain check FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`\nsupply-chain check passed: ${PACKAGES.length} packages, all MIT, all within size budget, all real payloads built and present.`);
