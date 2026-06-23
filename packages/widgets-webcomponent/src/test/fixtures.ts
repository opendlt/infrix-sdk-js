import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // test-dist/test
// The sample bundle is vendored into @infrix/verify (workspace sibling), itself
// drift-fenced against pkg/nexus/web — read from there so this runs in the
// extracted SDK repo too. test-dist/test -> test-dist -> widgets-webcomponent -> packages.
const verifyFixtures = join(here, '..', '..', '..', 'verify', 'src');

export function loadSampleBundle(): any {
  const p = join(verifyFixtures, 'sample.infrixstory.bundle.json');
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
