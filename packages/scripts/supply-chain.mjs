// Supply-chain checks for the adoption-10 happy-path packages:
//   - every package is MIT-licensed;
//   - every package declares pinned (no-range) third-party deps, if any;
//   - every package's published payload is under its size budget.
//
// Run: node scripts/supply-chain.mjs   (or: npm run check:supply-chain)
// Exits non-zero on any violation.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const PACKAGES = ['golden-escrow', 'metamask', 'proof-receipt', 'nexus-embed', 'cinema-embed'];

// Per-package published-size budgets (bytes). cinema-embed vendors the whole
// Cinema core, so it is allowed a larger budget.
const BUDGET = {
  'golden-escrow': 64 * 1024,
  'metamask': 64 * 1024,
  'proof-receipt': 256 * 1024,
  'nexus-embed': 256 * 1024,
  'cinema-embed': 1024 * 1024,
};

const problems = [];

function dirSize(p) {
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, e.name);
    if (e.isDirectory()) total += dirSize(full);
    else total += fs.statSync(full).size;
  }
  return total;
}

function pathSize(p) {
  if (!fs.existsSync(p)) return 0;
  return fs.statSync(p).isDirectory() ? dirSize(p) : fs.statSync(p).size;
}

for (const name of PACKAGES) {
  const pkgDir = path.join(root, name);
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

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

  // Ensure the published files exist (build first so vendor/ is present).
  try {
    execSync('node scripts/' + (fs.existsSync(path.join(pkgDir, 'scripts', 'vendor.mjs')) ? 'vendor.mjs' : 'check.mjs'), {
      cwd: pkgDir,
      stdio: 'ignore',
    });
  } catch {
    /* build check failures are caught by `npm test`; size check tolerates absence */
  }

  // Size of the declared `files` payload.
  let size = 0;
  for (const f of pkg.files || []) {
    size += pathSize(path.join(pkgDir, f));
  }
  const budget = BUDGET[name];
  const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
  if (size > budget) {
    problems.push(`${name}: payload ${kb(size)} exceeds budget ${kb(budget)}`);
  } else {
    console.log(`  ${name}: ${kb(size)} / ${kb(budget)} — MIT — ok`);
  }
}

if (problems.length) {
  console.error('\nsupply-chain check FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nsupply-chain check passed: 5 packages, all MIT, all within size budget.');
