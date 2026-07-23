// verify-npm-registry.test.mjs — behavioral tests for the Plan-3 registry lane
// verifier. A local HTTP server stands in for the npm registry so the live/absent
// and shasum/integrity-match logic is proven offline and deterministically.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPackages, repoRoot } from '../scripts/release-packages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.join(here, '..', 'scripts', 'verify-npm-registry.mjs');

const KNOWN_SHASUM = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const KNOWN_INTEGRITY = 'sha512-KNOWNKNOWNKNOWNKNOWNKNOWNKNOWNKNOWNKNOWN==';

// startMockRegistry serves a packument per package. `mode` controls the scenario:
//   'allLive'  — every package published at its target version (matching hashes)
//   'twoAbsent'— two packages 404, the rest live
//   'badHash'  — every package live but with a shasum that will NOT match a manifest
function startMockRegistry(pkgs, mode) {
  const byEncName = new Map();
  const absent = new Set(mode === 'twoAbsent' ? [pkgs[0].name, pkgs[1].name] : []);
  // The verifier requests /<name with '/' -> %2f> (see verify-npm-registry.mjs).
  const enc = (name) => name.replace('/', '%2f');
  for (const p of pkgs) {
    if (absent.has(p.name)) continue;
    // Every published version carries a build-provenance attestation, EXCEPT in
    // 'noProvenance' mode where the first package is missing it (to prove the lane
    // fails closed without provenance).
    const hasProv = !(mode === 'noProvenance' && p.name === pkgs[0].name);
    byEncName.set(enc(p.name), {
      name: p.name,
      'dist-tags': { latest: p.version },
      versions: {
        [p.version]: {
          name: p.name,
          version: p.version,
          dist: {
            shasum: mode === 'badHash' ? 'ffffffffffffffffffffffffffffffffffffffff' : KNOWN_SHASUM,
            integrity: mode === 'badHash' ? 'sha512-BADBADBADBADBADBADBADBADBADBADBADBADBAD==' : KNOWN_INTEGRITY,
            ...(hasProv ? { attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/x', provenance: { predicateType: 'https://slsa.dev/provenance/v1' } } } : {}),
          },
        },
      },
    });
  }
  const server = http.createServer((req, res) => {
    // The verifier requests /<name> with '/' encoded as %2f for scoped names.
    const key = req.url.replace(/^\//, '');
    const doc = byEncName.get(key);
    if (!doc) {
      res.writeHead(404).end('{}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(doc));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// runVerifier spawns the verifier ASYNChronously (not spawnSync) so this
// process's event loop stays free to serve the in-process mock registry — a
// blocking spawnSync would deadlock the mock.
function runVerifier(port, { manifest } = {}) {
  const out = path.join(os.tmpdir(), `rv-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const args = [verifier, '--registry', `http://127.0.0.1:${port}`, '--out', out];
  if (manifest) args.push('--manifest', manifest);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: path.join(here, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.stdout.on('data', (d) => (stdout += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (!fs.existsSync(out)) {
        reject(new Error(`verifier wrote no artifact (exit ${code}). stderr:\n${stderr}\nstdout:\n${stdout}`));
        return;
      }
      const artifact = JSON.parse(fs.readFileSync(out, 'utf8'));
      fs.unlinkSync(out);
      resolve({ status: code, artifact, stderr });
    });
  });
}

test('allLive: every package live at its target version → allLive=true, exit 0', async () => {
  const pkgs = loadPackages();
  const { server, port } = await startMockRegistry(pkgs, 'allLive');
  try {
    const { status, artifact } = await runVerifier(port);
    assert.equal(artifact.expectedPackages, 11);
    assert.equal(artifact.actualPackages, 11);
    assert.equal(artifact.livePackages, 11);
    assert.equal(artifact.allLive, true);
    assert.equal(status, 0, 'exit 0 when all 11 live');
  } finally {
    server.close();
  }
});

test('twoAbsent: two 404 packages → allLive=false, exit 1, RED', async () => {
  const pkgs = loadPackages();
  const { server, port } = await startMockRegistry(pkgs, 'twoAbsent');
  try {
    const { status, artifact } = await runVerifier(port);
    assert.equal(artifact.allLive, false);
    assert.equal(artifact.livePackages, 9);
    assert.equal(status, 1, 'exit 1 when not all live');
    const absent = artifact.packages.filter((p) => !p.live).map((p) => p.name);
    assert.equal(absent.length, 2);
  } finally {
    server.close();
  }
});

test('integrity: a pack manifest whose shasum/integrity match → allIntegrityVerified=true', async () => {
  const pkgs = loadPackages();
  const { server, port } = await startMockRegistry(pkgs, 'allLive');
  const manifest = path.join(os.tmpdir(), `pm-${Date.now()}.json`);
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      packages: pkgs.map((p) => ({ name: p.name, version: p.version, shasum: KNOWN_SHASUM, integrity: KNOWN_INTEGRITY })),
    }),
  );
  try {
    const { status, artifact } = await runVerifier(port, { manifest });
    assert.equal(artifact.allLive, true);
    assert.equal(artifact.allIntegrityVerified, true);
    assert.ok(artifact.packages.every((p) => p.shasumMatch === true && p.integrityMatch === true));
    assert.equal(status, 0);
  } finally {
    server.close();
    fs.unlinkSync(manifest);
  }
});

test('integrity mismatch: registry hash differs from the pack manifest → RED, exit 1', async () => {
  const pkgs = loadPackages();
  const { server, port } = await startMockRegistry(pkgs, 'badHash');
  const manifest = path.join(os.tmpdir(), `pm-${Date.now()}.json`);
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      packages: pkgs.map((p) => ({ name: p.name, version: p.version, shasum: KNOWN_SHASUM, integrity: KNOWN_INTEGRITY })),
    }),
  );
  try {
    const { status, artifact } = await runVerifier(port, { manifest });
    assert.equal(artifact.allLive, true, 'all live at the version...');
    assert.equal(artifact.allIntegrityVerified, false, '...but the published payload does not match the pack manifest');
    assert.equal(status, 1, 'a published-but-different payload is RED');
  } finally {
    server.close();
    fs.unlinkSync(manifest);
  }
});

test('noProvenance: a package published WITHOUT provenance → RED, exit 1', async () => {
  const pkgs = loadPackages();
  const { server, port } = await startMockRegistry(pkgs, 'noProvenance');
  try {
    const { status, artifact } = await runVerifier(port);
    assert.equal(artifact.allLive, true, 'all live...');
    assert.equal(artifact.allProvenance, false, '...but one lacks a provenance attestation');
    assert.equal(artifact.provenancePackages, 10);
    assert.equal(status, 1, 'a package without provenance is RED');
  } finally {
    server.close();
  }
});

test('allLive scenario also carries provenance on every package', async () => {
  const pkgs = loadPackages();
  const { server, port } = await startMockRegistry(pkgs, 'allLive');
  try {
    const { artifact } = await runVerifier(port);
    assert.equal(artifact.allProvenance, true);
    assert.equal(artifact.provenancePackages, 11);
    assert.ok(artifact.packages.every((p) => p.provenance === true));
  } finally {
    server.close();
  }
});

test('the verifier covers exactly the 11 canonical packages', () => {
  const pkgs = loadPackages();
  assert.equal(pkgs.length, 11, 'release-packages.mjs must resolve exactly 11 publishable packages');
  const names = new Set(pkgs.map((p) => p.name));
  for (const n of [
    '@infrix/verify', '@infrix/proof-receipt', '@infrix/widgets', '@infrix/widgets-webcomponent',
    '@infrix/metamask', '@infrix/golden-escrow', '@infrix/prover', '@infrix/templates',
    '@infrix/client', '@infrix/wallet', '@infrix/sdk',
  ]) {
    assert.ok(names.has(n), `verifier must cover ${n}`);
  }
  assert.ok(repoRoot);
});
