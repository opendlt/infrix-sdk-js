// AssemblyScript SDK smoke test.
//
// AUDIT_FINDINGS_2026-05-21 #8 closure: pre-closure `npm test` ran
// `asp --summary` which entered an unrecoverable Binaryen/ESM error
// before reaching any test case. The AS-pect 8 toolchain is
// effectively unmaintained against modern Node + Binaryen, and no
// test cases were actually defined under assembly/__tests__/, so the
// command's signal-to-failure ratio was zero.
//
// This replaces AS-pect with a stable node-based runner that loads
// the canonical wasm artifact produced by `npm run asbuild` and
// exercises the SDK's heartbeat export. It gives the gate a clean
// bounded result and a real verification value: if the SDK build
// silently regresses to producing a non-instantiable WASM, this
// fails loudly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const releasePath = join(here, '..', 'build', 'release.wasm');

test('release wasm instantiates and exports infrix_sdk_version', async () => {
  const bytes = readFileSync(releasePath);
  const mod = await WebAssembly.instantiate(bytes, {
    env: {
      // The AS runtime calls abort with (msg, fileName, line, column).
      // Silently propagate as a thrown JS error so the test fails loud.
      abort: (msg, file, line, col) => {
        throw new Error(`wasm abort: msg=${msg} file=${file} line=${line} col=${col}`);
      },
    },
  });
  const exp = mod.instance.exports;
  assert.equal(typeof exp.infrix_sdk_version, 'function', 'infrix_sdk_version must be a WASM export');
  const v = exp.infrix_sdk_version();
  assert.equal(typeof v, 'number');
  // 0.1.0 == (0 << 24) | (1 << 16) | (0 << 8) | 0 = 0x00010000
  assert.equal(v, 0x00010000, 'SDK version constant must match 0.1.0');
});
