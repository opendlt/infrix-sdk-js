// Windows-safe DIRECT-NODE build for every publishable package (pass-26 audit P0-3).
//
// The npm lifecycle spawner is unusable on a Windows checkout whose global npm is
// compromised or hits the Node-22 `.cmd`-spawn EPERM: `npm run build` cannot run,
// so `dist/` (gitignored) is never produced and scripts/supply-chain-direct.mjs
// strict-fails with NEEDS_BUILD. This script rebuilds every package's publish
// output WITHOUT invoking npm: it spawns node.exe directly for each package's build
// steps (vendored copiers, a node-launched tsc/asc, esbuild's node API), so no
// `.cmd` bin shim and no npm lifecycle process is ever spawned.
//
// It is intentionally explicit (one entry per package) so it can never drift into
// running an arbitrary `npm run` chain. Run it, then verify with
// `node scripts/supply-chain-direct.mjs` (strict) — both spawn no npm.
//
// Run: node scripts/build-all-direct.mjs            (needs INFRIX_CORE_DIR for @infrix/prover)

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './release-packages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
void here;

// resolveBin resolves a package bin's JS entrypoint from a package directory, so we
// can launch it via node.exe (never the `.cmd` shim).
function resolveBin(fromDir, spec) {
  const req = createRequire(path.join(fromDir, 'x.js'));
  return req.resolve(spec);
}

// runNode spawns node.exe (a real executable, never a .cmd) for one build step in
// `dir`. Because this script is launched directly (not by npm), spawning a child is
// permitted on Windows — the failure mode only affects grandchildren of npm.
function runNode(dir, args, label) {
  const res = spawnSync(process.execPath, args, { cwd: dir, stdio: 'inherit', env: process.env });
  if (res.error) throw new Error(`${label}: launch failed: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${label}: exited ${res.status}`);
}

// Build steps per package dir (relative to repoRoot). Ordered so dependencies build
// first (widgets before widgets-webcomponent). Each step is a node invocation.
const P = (rel) => path.join(repoRoot, rel);
const tscOf = (dir) => resolveBin(dir, 'typescript/bin/tsc');
const ascOf = (dir) => resolveBin(dir, 'assemblyscript/bin/asc.js');

const builds = [
  { name: '@infrix/proof-receipt', dir: P('packages/proof-receipt'), steps: (d) => [[ 'vendor', [path.join(d, 'scripts', 'vendor.mjs')] ]] },
  { name: '@infrix/metamask', dir: P('packages/metamask'), steps: (d) => [[ 'check', [path.join(d, 'scripts', 'check.mjs')] ]] },
  { name: '@infrix/golden-escrow', dir: P('packages/golden-escrow'), steps: (d) => [[ 'check', [path.join(d, 'scripts', 'check.mjs')] ]] },
  { name: '@infrix/widgets', dir: P('packages/widgets'), steps: (d) => [
    [ 'vendor', [path.join(d, 'scripts', 'vendor.mjs')] ],
    [ 'tsc', [tscOf(d)] ],
    [ 'emit-css', [path.join(d, 'scripts', 'emit-css.mjs')] ],
  ] },
  { name: '@infrix/widgets-webcomponent', dir: P('packages/widgets-webcomponent'), steps: (d) => [
    [ 'tsc', [tscOf(d)] ],
    [ 'bundle', [path.join(d, 'scripts', 'bundle.mjs')] ],
  ] },
  { name: '@infrix/client', dir: P('typescript'), steps: (d) => [[ 'tsc', [tscOf(d)] ]] },
  { name: '@infrix/wallet', dir: P('typescript-wallet'), steps: (d) => [[ 'tsc', [tscOf(d)] ]] },
  { name: '@infrix/sdk', dir: P('assemblyscript'), steps: (d) => [
    [ 'asc:debug', [ascOf(d), 'assembly/wasm-entry.ts', '--target', 'debug'] ],
    [ 'asc:release', [ascOf(d), 'assembly/wasm-entry.ts', '--target', 'release'] ],
  ] },
];

const failures = [];
for (const b of builds) {
  if (!fs.existsSync(b.dir)) { console.log(`  ${b.name}: SKIP (dir absent)`); continue; }
  try {
    console.log(`\n=== building ${b.name} (direct node, no npm) ===`);
    for (const [label, args] of b.steps(b.dir)) runNode(b.dir, args, `${b.name} ${label}`);
    console.log(`  ${b.name}: built`);
  } catch (e) {
    failures.push(`${b.name}: ${e.message}`);
    console.error(`  ${b.name}: FAILED — ${e.message}`);
  }
}

// @infrix/prover vendors from an infrix-core checkout; only buildable when the
// source tree is available. Best-effort: build when INFRIX_CORE_DIR is set.
const proverDir = P('packages/prover');
if (fs.existsSync(proverDir)) {
  if (process.env.INFRIX_CORE_DIR) {
    try {
      console.log(`\n=== building @infrix/prover (direct node, no npm) ===`);
      runNode(proverDir, [path.join(proverDir, 'scripts', 'vendor.mjs')], '@infrix/prover vendor');
      console.log('  @infrix/prover: built');
    } catch (e) {
      failures.push(`@infrix/prover: ${e.message}`);
      console.error(`  @infrix/prover: FAILED — ${e.message}`);
    }
  } else {
    console.log('\n  @infrix/prover: SKIP (set INFRIX_CORE_DIR to vendor its prover core)');
  }
}

if (failures.length) {
  console.error('\nbuild-all-direct FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('\nbuild-all-direct: all packages built directly via node (no npm spawned). Verify with: node scripts/supply-chain-direct.mjs');
