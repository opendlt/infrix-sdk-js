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
// If the monorepo source is present, this ALWAYS rebuilds the WASM so the
// artifact and its sha256 manifest are co-generated and never a stale pair.
//
// Freshness policy (DX P1-3b-3, audit 2026-07-04 P1): when the monorepo source
// is present, a failed rebuild is a HARD failure — silently falling back to
// committed assets would ship a stale/mismatched prover from a dev/CI tree that
// is supposed to be reproducible. The committed-assets fallback is reserved for
// the published/extracted install (source absent). A monorepo contributor who
// genuinely cannot build (no Go toolchain, offline) may opt out explicitly by
// setting INFRIX_PROVER_ALLOW_VENDORED=1, which downgrades a build failure to a
// warning and reuses committed assets if present.

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
const sourcePresent = fs.existsSync(path.join(core, 'cmd', 'prover-wasm'));
const allowVendored = /^(1|true|yes)$/i.test(process.env.INFRIX_PROVER_ALLOW_VENDORED || '');
if (sourcePresent) {
  try {
    console.log(`@infrix/prover: building WASM from ${core} ...`);
    execFileSync('bash', ['scripts/build-prover-wasm.sh'], { cwd: core, stdio: 'inherit' });
  } catch (e) {
    if (allowVendored) {
      console.warn(
        `@infrix/prover: WASM rebuild failed (${e.message}); ` +
          'INFRIX_PROVER_ALLOW_VENDORED is set — falling back to committed assets.'
      );
    } else {
      console.error(
        `@infrix/prover: WASM rebuild FAILED (${e.message}).\n` +
          '  The infrix-core source is present, so the prover must build from it — ' +
          'silently reusing committed assets could ship a stale, mismatched artifact.\n' +
          '  Fix the build (ensure a Go toolchain + bash are installed), or, if you ' +
          'cannot build locally, set INFRIX_PROVER_ALLOW_VENDORED=1 to reuse committed assets.'
      );
      process.exit(1);
    }
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
  const why = sourcePresent
    ? 'freshly built artifact unavailable, INFRIX_PROVER_ALLOW_VENDORED opt-out active'
    : 'monorepo source absent (published-install mode)';
  console.log(`@infrix/prover: using committed assets/ — ${why}.`);
} else {
  console.error(
    '@infrix/prover: no WASM artifact found. Set INFRIX_CORE_DIR to an infrix-core checkout ' +
      'and ensure a Go toolchain is installed, or install a published build that ships assets/.'
  );
  process.exit(1);
}
