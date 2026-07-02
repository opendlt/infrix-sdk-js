// Vendor the WASM prover artifact into @infrix/prover/assets (DX P1-3b-3).
//
// Source of truth is the infrix-core monorepo: cmd/prover-wasm built by
// scripts/build-prover-wasm.sh into dist/prover/. This script copies
// {infrix-prover.wasm, wasm_exec.js, manifest.json} into ./assets so the
// package is self-contained and publishable.
//
// Resolution order for the infrix-core checkout:
//   1. $INFRIX_CORE_DIR
//   2. the sibling ../../../../infrix-core (default dev layout)
// If dist/prover is missing but the source + a Go toolchain are present, this
// runs the build script first. When neither the artifact nor the source is
// available (a published/extracted install), it is a no-op if assets already
// exist, and a clear error otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const assetsDir = path.join(pkgRoot, 'assets');
const FILES = ['infrix-prover.wasm', 'wasm_exec.js', 'manifest.json'];

function coreDir() {
  if (process.env.INFRIX_CORE_DIR) return path.resolve(process.env.INFRIX_CORE_DIR);
  return path.resolve(pkgRoot, '..', '..', '..', 'infrix-core');
}

function haveAllAssets() {
  return FILES.every((f) => fs.existsSync(path.join(assetsDir, f)));
}

const core = coreDir();
const distProver = path.join(core, 'dist', 'prover');

// When the monorepo source is present, ALWAYS rebuild so the wasm and its
// manifest (sha256) are co-generated in one run — never a stale, mismatched
// pair (which would trip the loader's integrity check).
if (fs.existsSync(path.join(core, 'cmd', 'prover-wasm'))) {
  try {
    console.log(`@infrix/prover: building WASM from ${core} ...`);
    execFileSync('bash', ['scripts/build-prover-wasm.sh'], { cwd: core, stdio: 'inherit' });
  } catch (e) {
    console.log(`@infrix/prover: build step failed (${e.message}); will fall back to committed assets if present.`);
  }
}

if (fs.existsSync(path.join(distProver, 'infrix-prover.wasm'))) {
  fs.mkdirSync(assetsDir, { recursive: true });
  for (const f of FILES) {
    const dest = path.join(assetsDir, f);
    // wasm_exec.js is copied from Go's toolchain cache, which is read-only;
    // clear the attribute so a re-vendor can overwrite it (Windows EPERM).
    if (fs.existsSync(dest)) {
      try {
        fs.chmodSync(dest, 0o644);
      } catch {
        /* best effort */
      }
    }
    fs.copyFileSync(path.join(distProver, f), dest);
    try {
      fs.chmodSync(dest, 0o644);
    } catch {
      /* best effort */
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(assetsDir, 'manifest.json'), 'utf8'));
  console.log(`@infrix/prover: vendored ${manifest.wasmBytes} bytes (sha256 ${manifest.wasmSha256.slice(0, 12)}…) from ${distProver}`);
} else if (haveAllAssets()) {
  console.log('@infrix/prover: monorepo source absent — using committed assets/ (published-install mode).');
} else {
  console.error(
    '@infrix/prover: no WASM artifact found. Set INFRIX_CORE_DIR to an infrix-core checkout ' +
      'and ensure a Go toolchain is installed, or install a published build that ships assets/.'
  );
  process.exit(1);
}
