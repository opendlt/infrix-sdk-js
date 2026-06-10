import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // test-dist/test
// test-dist/test -> test-dist -> widgets-webcomponent -> packages -> sdk -> repo
const repoRoot = join(here, '..', '..', '..', '..', '..');

export function loadSampleBundle(): any {
  const p = join(repoRoot, 'pkg', 'nexus', 'web', 'testdata', 'sample.infrixstory.bundle.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function tamperedBundle(): any {
  const b = loadSampleBundle();
  const name = b.story.manifest[0].file;
  const raw = Buffer.from(b.files[name], 'base64');
  raw[raw.length - 1] ^= 0xff;
  b.files[name] = raw.toString('base64');
  return b;
}
