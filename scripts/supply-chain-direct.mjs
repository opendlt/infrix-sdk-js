// Windows-compatible DIRECT-NODE supply-chain guard (pass-23 audit P2-3).
//
// scripts/supply-chain-all.mjs is the AUTHORITATIVE fresh-payload guard: it purges
// generated dirs, re-runs each package's prepack via the npm lifecycle, and packs
// with `npm pack` so the inspected file list is exactly what would publish. That is
// the guard CI (Linux) runs and archives for all 11 packages.
//
// On some Windows checkouts the npm LIFECYCLE spawner fails with `spawn EPERM`
// (a node/npm/Windows toolchain interaction — npm spawns child processes for
// `npm run build --workspaces` / prepack), so `npm pack`-based verification is not
// reproducible locally there. This script is the reproducible fallback: it spawns
// NOTHING (pure Node fs/path), so it never hits the npm-lifecycle EPERM, and it
// verifies — over the SAME 11 packages (shared enumeration in release-packages.mjs)
// — everything that does not require re-running the npm lifecycle:
//
//   - license is MIT;
//   - third-party deps are pinned (no ranges; @infrix/* siblings exempt);
//   - the resolved published file set (package `files` globs + npm defaults) is
//     non-empty;
//   - every file the manifest DECLARES via main/types/exports is present on disk;
//   - package-specific required generated files are present on disk;
//   - the on-disk published payload is within the size budget.
//
// It verifies the CURRENT ON-DISK BUILT state. Freshness (delete-then-rebuild) is
// delegated to the CI `npm pack` guard. A package whose build output is absent is
// reported NEEDS_BUILD.
//
// STRICT BY DEFAULT (pass-24 audit P1-4): the default (release/audit) posture
// FAILS on any NEEDS_BUILD — a supply-chain guard must never print "passed" while
// required publish output is missing. Pass `--triage` for a Windows soft-check
// that reports NEEDS_BUILD without failing (for diagnosing which packages to build
// on a box where the npm lifecycle spawner is broken).
//
// Run: node scripts/supply-chain-direct.mjs            # STRICT (release/audit)
//      node scripts/supply-chain-direct.mjs --triage   # soft Windows triage

import fs from 'node:fs';
import path from 'node:path';
import { loadPackages, GUARD_CONFIG, DEFAULT_BUDGET } from './release-packages.mjs';

// Pass-24 audit P1-4: STRICT-by-default. A package whose build output is absent
// (NEEDS_BUILD) FAILS the guard in the default release/audit posture — a supply-
// chain guard must never print "passed" while required publish output is missing.
// `--triage` is the soft Windows-triage mode: it still reports NEEDS_BUILD but
// exits 0, for diagnosing which packages need building on a box where the npm
// lifecycle spawner is broken. `--require-built` is retained as an explicit alias
// for the strict default.
const triage = process.argv.includes('--triage');
const fails = [];
const needsBuild = [];

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

// walkFiles returns all file paths (posix, relative to base) under a directory.
function walkFiles(base, relDir = '') {
  const abs = path.join(base, relDir);
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = relDir ? `${relDir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out.push(...walkFiles(base, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

// globToRegExp converts an npm files glob (supporting **, *, and literal path
// segments) to an anchored RegExp over posix-relative paths.
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** matches any path segment sequence.
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

// resolvePublishedFiles computes the set of posix-relative files npm would publish
// for a package, from its `files` field (+ npm defaults) applied to the on-disk
// tree. When `files` is absent, npm includes everything not ignored — approximated
// here by the full tree minus node_modules/.git. Negation patterns (`!...`) exclude.
function resolvePublishedFiles(dir, pkg) {
  const all = walkFiles(dir);
  const filesField = Array.isArray(pkg.files) ? pkg.files : null;
  const selected = new Set();

  if (!filesField) {
    for (const f of all) selected.add(f);
  } else {
    const includes = [];
    const excludes = [];
    for (const raw of filesField) {
      const neg = raw.startsWith('!');
      const pat = neg ? raw.slice(1) : raw;
      (neg ? excludes : includes).push(pat);
    }
    for (const pat of includes) {
      if (pat.endsWith('/')) {
        const baseDir = pat.slice(0, -1);
        for (const f of all) if (f === baseDir || f.startsWith(baseDir + '/')) selected.add(f);
      } else if (pat.includes('*')) {
        const re = globToRegExp(pat);
        for (const f of all) if (re.test(f)) selected.add(f);
      } else if (all.includes(pat)) {
        selected.add(pat);
      } else {
        // directory named without a trailing slash
        for (const f of all) if (f.startsWith(pat + '/')) selected.add(f);
      }
    }
    for (const pat of excludes) {
      const re = pat.includes('*') ? globToRegExp(pat) : null;
      for (const f of [...selected]) {
        if (re ? re.test(f) : (f === pat || f.startsWith(pat + '/'))) selected.delete(f);
      }
    }
  }
  // npm ALWAYS includes package.json, README*, LICENSE* regardless of `files`.
  for (const f of all) {
    if (f === 'package.json' || /^readme(\.|$)/i.test(f) || /^licen[sc]e(\.|$)/i.test(f)) selected.add(f);
  }
  return selected;
}

function payloadSize(dir, files) {
  let total = 0;
  for (const f of files) {
    try {
      total += fs.statSync(path.join(dir, f)).size;
    } catch {
      /* missing file counted as 0 (flagged elsewhere) */
    }
  }
  return total;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KiB`;
const packages = loadPackages().filter((p) => p.name);

for (const { dir, name, rel, pkg } of packages) {
  const cfg = GUARD_CONFIG[name] || {};

  if (pkg.license !== 'MIT') {
    fails.push(`${name}: license is ${pkg.license ?? '(none)'}, expected MIT`);
  }
  for (const [dep, range] of Object.entries(pkg.dependencies || {})) {
    if (dep.startsWith('@infrix/')) continue;
    if (/[\^~*><]|x/.test(range)) fails.push(`${name}: dependency ${dep}@${range} is not pinned`);
  }

  const published = resolvePublishedFiles(dir, pkg);
  if (published.size <= 1) {
    fails.push(`${name}: resolved published payload is empty (${published.size} file[s])`);
  }

  const declared = declaredTargets(pkg);
  const required = cfg.requiredFiles || [];
  const missing = [];
  for (const need of [...declared, ...required]) {
    if (!fs.existsSync(path.join(dir, need))) missing.push(need);
  }

  const size = payloadSize(dir, published);
  const budget = cfg.budget ?? DEFAULT_BUDGET;
  if (size > budget) {
    fails.push(`${name}: on-disk payload ${kb(size)} exceeds budget ${kb(budget)}`);
  }

  if (missing.length) {
    // A missing declared/required file usually means the package is not built.
    const hasGenerated = (cfg.generated || []).length > 0;
    if (hasGenerated && !(cfg.generated || []).every((g) => fs.existsSync(path.join(dir, g)))) {
      needsBuild.push(`${name}: NEEDS_BUILD — build output absent (missing ${missing.join(', ')}); run the build or verify via the CI npm-pack artifact`);
    } else {
      fails.push(`${name}: declared/required file(s) MISSING from a built payload: ${missing.join(', ')}`);
    }
  } else {
    console.log(`  ${name}: ${kb(size)} / ${kb(budget)} — ${published.size} files — MIT — ok  (${rel})`);
  }
}

for (const w of needsBuild) console.log(`  ${w}`);

// STRICT default: any FAIL, or any NEEDS_BUILD (unless --triage), fails the guard.
if (fails.length || (!triage && needsBuild.length)) {
  console.error('\nsupply-chain-direct check FAILED:');
  for (const p of fails) console.error('  - ' + p);
  if (!triage) for (const w of needsBuild) console.error('  - ' + w);
  if (!triage && needsBuild.length) {
    console.error(
      '  hint: build the package(s) above, then re-run — a release/audit guard must not pass with missing publish output. ' +
        'Use --triage for a Windows soft-check that reports NEEDS_BUILD without failing.',
    );
  }
  process.exit(1);
}
console.log(
  `\nsupply-chain-direct check passed: ${packages.length} packages — license + pins + declared/required payload verified on disk (no npm spawned).` +
    (triage && needsBuild.length
      ? ` [TRIAGE] ${needsBuild.length} package(s) NEEDS_BUILD were reported but NOT failed (--triage). Build them for a release-mode pass.`
      : ' All packages are built and within budget.') +
    `\nThe authoritative FRESH-payload manifest for all 11 packages is produced by CI via scripts/supply-chain-all.mjs (npm pack).`,
);
