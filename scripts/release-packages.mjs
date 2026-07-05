// Single source of truth for the FULL publishable @infrix/* npm surface (audit
// Z4). release-npm.mjs (preflight/dry-run/publish) and supply-chain-all.mjs both
// enumerate packages through here, so the release plan, the payload guard, and the
// publish step can never disagree about which packages exist.
//
// The set is the eight workspace packages (derived from packages/package.json
// `workspaces`, so it can't drift) plus the three standalone public packages.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '..');

// Standalone public packages that live outside packages/.
export const STANDALONE = ['typescript', 'typescript-wallet', 'assemblyscript'];

// packageDirs returns absolute package directories for the full npm surface.
export function packageDirs() {
  const wsRoot = path.join(repoRoot, 'packages');
  const ws = JSON.parse(fs.readFileSync(path.join(wsRoot, 'package.json'), 'utf8')).workspaces || [];
  const workspace = ws.map((w) => path.join(wsRoot, w));
  const standalone = STANDALONE.map((d) => path.join(repoRoot, d));
  return [...workspace, ...standalone];
}

// loadPackages reads each package.json and returns descriptors. Private packages
// are excluded (never published). `kind` is 'workspace' or 'standalone'.
export function loadPackages() {
  const wsRoot = path.join(repoRoot, 'packages');
  const out = [];
  for (const dir of packageDirs()) {
    const rel = path.relative(repoRoot, dir).replace(/\\/g, '/');
    const pjPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pjPath)) {
      out.push({ dir, rel, name: null, version: null, private: false, kind: 'unknown', error: 'no package.json' });
      continue;
    }
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    if (pj.private) continue;
    out.push({
      dir,
      rel,
      name: pj.name || null,
      version: pj.version || null,
      private: !!pj.private,
      kind: dir.startsWith(wsRoot) ? 'workspace' : 'standalone',
      pkg: pj,
    });
  }
  return out;
}

// Per-package release-guard config, keyed by package name. Budgets are the real
// npm-pack unpackedSize ceilings; `requiredFiles` are generated artifacts a
// consumer needs that main/types/exports do NOT name; `generated` are untracked
// build-output dirs purged before packing so the inspected payload is proven fresh.
export const GUARD_CONFIG = {
  '@infrix/verify': { budget: 256 * 1024 },
  '@infrix/proof-receipt': { budget: 256 * 1024, generated: ['vendor'] },
  '@infrix/widgets': { budget: 512 * 1024, generated: ['dist'], requiredFiles: ['dist/index.js', 'dist/index.d.ts', 'styles.css'] },
  '@infrix/widgets-webcomponent': { budget: 512 * 1024, generated: ['dist'], requiredFiles: ['dist/index.js', 'dist/index.d.ts', 'dist/infrix-widgets.js'] },
  '@infrix/metamask': { budget: 64 * 1024 },
  '@infrix/golden-escrow': { budget: 64 * 1024 },
  '@infrix/prover': { budget: 26 * 1024 * 1024, generated: ['assets'], requiredFiles: ['assets/infrix-prover.wasm', 'assets/manifest.json', 'assets/wasm_exec.js'] },
  '@infrix/templates': { budget: 64 * 1024 },
  '@infrix/client': { budget: 1024 * 1024, generated: ['dist'] },
  '@infrix/wallet': { budget: 256 * 1024, generated: ['dist'] },
  '@infrix/sdk': { budget: 512 * 1024, generated: ['build'], requiredFiles: ['build/release.wasm'] },
};

export const DEFAULT_BUDGET = 512 * 1024;
