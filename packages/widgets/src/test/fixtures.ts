// Test fixtures: the canonical sample proof story bundle (shared with Nexus +
// the SDK) and helpers to decode + tamper it. These run in-repo only (tests are
// not part of the published package).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // dist/test
// dist/test -> dist -> widgets -> packages -> sdk -> repo root
const repoRoot = join(here, '..', '..', '..', '..', '..');

export function loadSampleBundle(): any {
  const p = join(repoRoot, 'pkg', 'nexus', 'web', 'testdata', 'sample.infrixstory.bundle.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** decodeBundleFile decodes a manifested file (base64) from the share bundle. */
export function decodeBundleFile(bundle: any, name: string): any {
  const b64 = bundle.files[name];
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

/** tamperedBundle flips a byte in a manifested file so its checksum no longer
 *  matches — a genuine tamper the verifier must catch. */
export function tamperedBundle(): any {
  const b = loadSampleBundle();
  const name = b.story.manifest[0].file;
  const raw = Buffer.from(b.files[name], 'base64');
  raw[raw.length - 1] ^= 0xff;
  b.files[name] = raw.toString('base64');
  return b;
}
