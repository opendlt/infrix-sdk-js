// Supply-chain checks for the adoption-10 happy-path packages:
//   - the package set is derived from packages/package.json `workspaces` (never a
//     hardcoded list that drifts — second-pass/third-pass audit T2);
//   - every package is MIT-licensed;
//   - every package declares pinned (no-range) third-party deps, if any;
//   - every package's ACTUAL published payload (npm pack --dry-run) is non-empty
//     and under its size budget — this inspects the real tarball, so a package
//     that would publish without its generated assets (e.g. @infrix/prover with
//     no WASM) is caught here, not by a consumer;
//   - @infrix/prover must ship its WASM assets.
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

// Packages that MUST ship specific generated files in their tarball.
const REQUIRED_FILES = {
  'prover': ['assets/infrix-prover.wasm', 'assets/manifest.json', 'assets/wasm_exec.js'],
};

const problems = [];
const npm = process.platform === 'win32' ? 'npm' : 'npm'; // execSync uses the shell → .cmd resolves

// packInfo returns { unpackedSize, files[] } for a package's real tarball.
// --ignore-scripts: we build explicitly below, so pack must not re-run prepack.
function packInfo(pkgDir) {
  const raw = execSync(`${npm} pack --dry-run --json --ignore-scripts`, { cwd: pkgDir, encoding: 'utf8' });
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

  // Populate generated/published files first (build/vendor if the package has one).
  for (const s of ['vendor.mjs', 'check.mjs']) {
    if (fs.existsSync(path.join(pkgDir, 'scripts', s))) {
      try {
        execSync(`node scripts/${s}`, { cwd: pkgDir, stdio: 'ignore' });
      } catch {
        /* build failure surfaces below as a missing/empty payload */
      }
      break;
    }
  }

  // Inspect the REAL tarball.
  let info;
  try {
    info = packInfo(pkgDir);
  } catch (e) {
    problems.push(`${name}: npm pack --dry-run failed: ${e.message.split('\n')[0]}`);
    continue;
  }

  // A published package must carry more than just package.json.
  if (info.files.length <= 1) {
    problems.push(`${name}: published payload is empty (${info.files.length} file[s]) — nothing but metadata would ship`);
  }

  // Required generated files (e.g. prover WASM assets).
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
console.log(`\nsupply-chain check passed: ${PACKAGES.length} packages, all MIT, all within size budget, all payloads present.`);
