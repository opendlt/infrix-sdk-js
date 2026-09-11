// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// THE FIFTH ENCODING, PRE-EMPTED.
//
// On 2026-09-10 the Infrix tree was found to be carrying FOUR different
// encodings of a W3C credential's `proofValue`: base64url and standard base64
// across the Go producers, hex in the offline verifier, and the multibase
// base58btc the specification actually requires — used nowhere. Each component
// round-tripped against itself and was green for years, while the offline
// verifier could not read a single credential the node issued.
//
// This repository was checked at the same time and is CLEAN, measured rather
// than assumed: `proofValue` appears in no source file here. @infrix/verify
// verifies portable evidence packages and proof receipts, not credentials, and
// @infrix/client's VerifiableCredential carries `proof` as an opaque
// Record<string, unknown> it never decodes.
//
// That is exactly the gap the defect class hides in: the moment somebody adds
// credential verification to the JavaScript SDK, they will reach for
// Buffer.from(pv, 'base64') because it is the obvious thing, and a fifth
// encoding arrives with nobody comparing it to the other four. This test makes
// that a red build instead.

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');

// THE CANONICAL ENCODING, and a vector to implement against.
//
// These are duplicated verbatim from infrix-core/pkg/zkp/vc/proofvalue_test.go
// and infrix-verify/credverify/proofvalue_test.go. The three modules are pinned
// to a shared VALUE rather than to each other, because agreeing-with-yourself is
// precisely what failed: 64 bytes 0x00..0x3f encode to this string.
export const CANONICAL_PROOFVALUE_PREFIX = 'z';
export const CANONICAL_PROOFVALUE_VECTOR =
  'z1GMkH3brNXiNNs1tiFZHu4yZSRrzJwxi5wB9bHFtMinfCXNnR1adh8Vo8NTheK4evneedH4qmvjeqcBBNAefgS';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'build', '.turbo']);
const SOURCE_EXT = /\.(mjs|cjs|js|ts|tsx)$/;

function sourceFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) sourceFiles(full, out);
    else if (SOURCE_EXT.test(name) && !full.endsWith(`test${sep}proofvalue.encoding.test.mjs`)) {
      out.push(full);
    }
  }
  return out;
}

// Decoders that must never be applied to a proofValue.
const BANNED = [
  { re: /Buffer\.from\s*\([^)]*proofValue[^)]*,\s*['"]base64(url)?['"]/i, name: "Buffer.from(proofValue, 'base64')" },
  { re: /Buffer\.from\s*\([^)]*proofValue[^)]*,\s*['"]hex['"]/i, name: "Buffer.from(proofValue, 'hex')" },
  { re: /atob\s*\(\s*[^)]*proofValue/i, name: 'atob(proofValue)' },
  { re: /proofValue[^\n]{0,40}\.toString\s*\(\s*['"](base64|hex)['"]\s*\)/i, name: "proofValue.toString('base64'|'hex')" },
];

test('no JavaScript source decodes a proofValue with a non-canonical encoding', () => {
  const files = sourceFiles(REPO_ROOT);
  assert.ok(
    files.length > 50,
    `only ${files.length} source files were scanned — this fence is not reading the repository ` +
      `it thinks it is (root ${REPO_ROOT})`,
  );

  const violations = [];
  let mentions = 0;
  for (const file of files) {
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!src.includes('proofValue')) continue;
    mentions += 1;
    for (const { re, name } of BANNED) {
      if (re.test(src)) {
        violations.push(`${relative(REPO_ROOT, file)} — ${name}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `A proofValue is being decoded with a non-canonical encoding:\n  ${violations.join('\n  ')}\n\n` +
      `proofValue is multibase base58btc: a leading '${CANONICAL_PROOFVALUE_PREFIX}' followed by ` +
      `base58 (Bitcoin alphabet). Four encodings of this field already coexisted in the Infrix ` +
      `tree because each component agreed with itself and none compared. Decode the multibase ` +
      `form and check it against ${CANONICAL_PROOFVALUE_VECTOR} (64 bytes 0x00..0x3f), which ` +
      `infrix-core and infrix-verify both assert.`,
  );

  // A note, not an assertion: this is the measured state, and it is WHY the
  // scan above currently finds nothing to reject.
  if (mentions === 0) {
    console.log(
      '  [proofValue] measured: no source file in this repository references proofValue. ' +
        '@infrix/verify handles portable evidence packages and proof receipts; the client ' +
        "SDK's VerifiableCredential carries `proof` as an opaque object it never decodes. " +
        'This fence exists to catch the first decoder added here.',
    );
  }
});

// The vector is exported for the implementer who eventually needs it, and
// asserted here so it cannot rot into a different shape unnoticed.
test('the canonical proofValue vector is well formed', () => {
  assert.equal(CANONICAL_PROOFVALUE_VECTOR[0], CANONICAL_PROOFVALUE_PREFIX);
  assert.ok(CANONICAL_PROOFVALUE_VECTOR.length > 80, 'a 64-byte signature encodes to ~88 chars');
  // The Bitcoin base58 alphabet excludes 0, O, I and l precisely so a human
  // cannot transcribe one as another.
  assert.equal(
    /[0OIl]/.test(CANONICAL_PROOFVALUE_VECTOR.slice(1)),
    false,
    'the vector contains a character outside the base58btc alphabet',
  );
});
