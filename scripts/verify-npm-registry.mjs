#!/usr/bin/env node
// verify-npm-registry.mjs — the npm-registry-published lane verifier (Plan-3).
//
// This is the SECOND, separate npm lane. The FIRST lane (npm-pack-manifest,
// scripts/supply-chain-all.mjs) proves every package BUILDS and PACKS correctly.
// This script proves those exact name@version are LIVE on the public npm
// registry — a claim the pack manifest can NEVER establish (a package can pack
// perfectly and never be published).
//
// It is deliberately npm-independent: it queries the registry directly over
// HTTPS (native fetch) rather than shelling out to `npm view`, so a compromised
// or divergent local npm cannot influence the result. For every one of the
// eleven publishable packages it:
//   1. fetches the registry packument at https://registry.npmjs.org/<name>;
//   2. confirms the EXACT version from the package's manifest is published
//      (a 404 package, or a package whose target version is absent, is RED);
//   3. compares the registry's dist.shasum AND dist.integrity against the pack
//      manifest's values where available (byte-identity of the published
//      payload). A mismatch is RED.
//
// It writes a registry-verification artifact (--out) and exits non-zero unless
// ALL eleven are live (and, where a pack manifest is supplied, integrity-matched).
// The Go release blocker (infrix-core) requires this artifact — it never marks
// the npm-registry lane green from checked-in JSON.
//
// Usage:
//   node scripts/verify-npm-registry.mjs \
//     [--manifest <pack-manifest.json>] [--out <registry-verification.json>] \
//     [--registry <url>] [--verified-at <iso8601>]
//
// With no --manifest, the eleven packages + their target versions come from
// scripts/release-packages.mjs (the single source of truth) at their current
// package.json versions; shasum/integrity comparison is then skipped (live-only).

import fs from 'node:fs';
import path from 'node:path';
import { loadPackages, repoRoot } from './release-packages.mjs';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const registry = (arg('--registry', DEFAULT_REGISTRY)).replace(/\/+$/, '');
const outPath = arg('--out', path.join(repoRoot, 'npm-registry-verification.json'));
const manifestPath = arg('--manifest', null);
const verifiedAt = arg('--verified-at', new Date().toISOString());

// packManifestByName maps a package name → { shasum, integrity } as recorded by
// the pack step, when a pack manifest is supplied. The pack manifest may be a
// { packages: { <name>: {...} } } map or a { packages: [ {name, ...} ] } array.
function packManifestByName() {
  if (!manifestPath) return {};
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const out = {};
  const add = (name, entry) => {
    if (!name) return;
    out[name] = {
      shasum: entry.shasum || entry.dist?.shasum || null,
      integrity: entry.integrity || entry.dist?.integrity || null,
      version: entry.version || null,
    };
  };
  if (Array.isArray(raw.packages)) {
    for (const e of raw.packages) add(e.name, e);
  } else if (raw.packages && typeof raw.packages === 'object') {
    for (const [name, e] of Object.entries(raw.packages)) add(name, { name, ...e });
  }
  return out;
}

// registryVersion fetches the packument and returns { ok, live, dist, reason }
// for an exact name@version. A 404 (never published) → live:false, ok:true.
// A network/parse failure → ok:false so the caller fails closed.
async function registryVersion(name, version) {
  const url = `${registry}/${name.replace('/', '%2f')}`;
  let res;
  try {
    // Bounded so a slow/dead registry fails the lane closed instead of hanging.
    res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  } catch (e) {
    return { ok: false, reason: `fetch failed: ${e.name === 'TimeoutError' ? 'registry probe timed out' : e.message}` };
  }
  if (res.status === 404) return { ok: true, live: false, reason: 'package not published (404)' };
  if (!res.ok) return { ok: false, reason: `registry HTTP ${res.status}` };
  let doc;
  try {
    doc = await res.json();
  } catch (e) {
    return { ok: false, reason: `packument parse failed: ${e.message}` };
  }
  const ver = doc.versions && doc.versions[version];
  if (!ver) {
    const latest = (doc['dist-tags'] && doc['dist-tags'].latest) || '—';
    const known = Object.keys(doc.versions || {}).join(', ') || '(none)';
    return { ok: true, live: false, reason: `version ${version} not on registry (latest ${latest}; published: ${known})` };
  }
  return { ok: true, live: true, dist: ver.dist || {} };
}

async function main() {
  const pkgs = loadPackages(); // canonical 11 (name, version), skips private
  const packMeta = packManifestByName();

  const results = [];
  let hardError = null;
  for (const p of pkgs) {
    const r = await registryVersion(p.name, p.version);
    if (!r.ok) {
      hardError = hardError || `${p.name}: ${r.reason}`;
      results.push({ name: p.name, version: p.version, live: false, error: r.reason });
      continue;
    }
    const pm = packMeta[p.name] || {};
    const regShasum = r.dist?.shasum || null;
    const regIntegrity = r.dist?.integrity || null;
    const shasumMatch = pm.shasum && regShasum ? pm.shasum === regShasum : null;
    const integrityMatch = pm.integrity && regIntegrity ? pm.integrity === regIntegrity : null;
    // Provenance: an npm build-provenance attestation (Sigstore) cryptographically
    // ties the published tarball to the exact GitHub commit + workflow run. It is a
    // stronger, non-fragile integrity guarantee than a shasum comparison (which
    // false-mismatches across non-byte-reproducible build environments).
    const att = r.dist?.attestations || null;
    const provenance = !!(att && (att.provenance || att.url));
    results.push({
      name: p.name,
      version: p.version,
      live: r.live,
      provenance,
      attestationsUrl: att?.url || null,
      registryShasum: regShasum,
      registryIntegrity: regIntegrity,
      manifestShasum: pm.shasum || null,
      manifestIntegrity: pm.integrity || null,
      shasumMatch,
      integrityMatch,
      note: r.live ? undefined : r.reason,
    });
  }

  const livePackages = results.filter((r) => r.live).length;
  const allLive = livePackages === pkgs.length && pkgs.length === 11;
  // integrity is "verified" only where a manifest value existed AND matched; a
  // missing manifest value is not a failure (live-only mode), but a present
  // value that mismatched IS a failure.
  const integrityMismatch = results.some((r) => r.shasumMatch === false || r.integrityMatch === false);
  const allIntegrityVerified = !integrityMismatch;
  const provenancePackages = results.filter((r) => r.live && r.provenance).length;
  const allProvenance = provenancePackages === pkgs.length && pkgs.length === 11;

  const artifact = {
    lane: 'npm-registry-published',
    note:
      'Live registry verification produced by scripts/verify-npm-registry.mjs — queries the public npm registry over HTTPS and confirms each exact name@version is PUBLISHED, that it carries a build-provenance attestation (dist.attestations — Sigstore, tied to the GitHub commit + workflow run), and compares dist.shasum/dist.integrity against the pack manifest where available. Provenance is the strong integrity guarantee (a shasum compare false-mismatches across non-byte-reproducible build environments). This is executable evidence of PUBLICATION; it is NOT a proxy for buildability (that is npm-pack-manifest). Never mark the release npm lane green from checked-in JSON — regenerate this against the live registry.',
    registry,
    verifiedAt,
    expectedPackages: 11,
    actualPackages: pkgs.length,
    livePackages,
    allLive,
    allIntegrityVerified,
    provenancePackages,
    allProvenance,
    packManifest: manifestPath ? path.relative(repoRoot, path.resolve(manifestPath)).replace(/\\/g, '/') : null,
    packages: results,
  };

  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`wrote registry-verification artifact to ${outPath}`);
  console.log(`  registry: ${registry}`);
  console.log(`  live: ${livePackages}/${pkgs.length} (expected 11), provenance: ${provenancePackages}/${pkgs.length}`);
  for (const r of results) {
    const mark = r.live ? 'LIVE ' : 'ABSENT';
    const extra = r.live
      ? `provenance=${r.provenance ? 'YES' : 'NO'} shasum=${r.shasumMatch === null ? 'n/a' : r.shasumMatch ? 'match' : 'MISMATCH'}`
      : r.note || r.error || '';
    console.log(`  ${mark} ${r.name}@${r.version}  ${extra}`);
  }

  if (hardError) {
    console.error(`\nregistry verification FAILED (fail-closed): ${hardError}`);
    process.exit(2);
  }
  if (!allLive) {
    console.error(`\nregistry verification: NOT all live — ${livePackages}/${pkgs.length} of the 11 packages are published at their target version. The npm-registry-published lane is RED until every package is live.`);
    process.exit(1);
  }
  if (!allIntegrityVerified) {
    console.error(`\nregistry verification: a published payload does NOT match the pack manifest (dist.shasum/integrity mismatch). The npm-registry-published lane is RED.`);
    process.exit(1);
  }
  if (!allProvenance) {
    console.error(`\nregistry verification: only ${provenancePackages}/${pkgs.length} packages carry a provenance attestation. The npm-registry-published lane is RED until every package is published WITH provenance.`);
    process.exit(1);
  }
  console.log(`\nregistry verification PASSED: all 11 packages live, provenance-attested, and integrity-consistent.`);
}

main().catch((e) => {
  console.error(`verify-npm-registry: unexpected error: ${e.stack || e.message}`);
  process.exit(2);
});
