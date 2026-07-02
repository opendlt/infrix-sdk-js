// @infrix/prover end-to-end tests (DX P1-3b-3). Loads the real WASM prover,
// generates a selective-disclosure proof in-process, self-verifies it, and
// asserts the private witness never leaves and a bad witness is rejected.
//
// Requires the vendored artifact (npm test runs `vendor` first). If the WASM is
// unavailable (no infrix-core checkout / no Go toolchain), the suite SKIPS
// rather than failing — building the artifact is a monorepo concern.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(here, '..', 'assets', 'infrix-prover.wasm');
const hasArtifact = existsSync(wasmPath);

function goEd25519Key() {
  // Go's ed25519.PrivateKey is seed(32) || pubkey(32).
  const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
  return new Uint8Array(Buffer.concat([Buffer.from(jwk.d, 'base64url'), Buffer.from(jwk.x, 'base64url')]));
}

test('loadProver → prove → verify round-trip (threshold_gte)', { skip: !hasArtifact && 'WASM artifact not vendored' }, async () => {
  const { loadProver } = await import('../src/index.js');
  const prover = await loadProver();

  const envelope = await prover.prove({
    predicate: 'threshold_gte',
    publicInputs: [18n],
    privateInputs: [21n],
    holderSigner: goEd25519Key(),
    purpose: 'age-over-18',
  });

  assert.ok(envelope.proof, 'envelope carries a proof');
  assert.ok(String(envelope.holderDid).startsWith('did:infrix:'), 'holder DID is minted');
  assert.ok(!JSON.stringify(envelope).includes('"21"'), 'private witness must not leak into the envelope');

  const result = await prover.verify(envelope);
  assert.equal(result.valid, true, result.reason || 'proof should verify');
});

test('a non-satisfying witness is rejected at proving time', { skip: !hasArtifact && 'WASM artifact not vendored' }, async () => {
  const { loadProver } = await import('../src/index.js');
  const prover = await loadProver();
  await assert.rejects(
    prover.prove({
      predicate: 'threshold_gte',
      publicInputs: [18n],
      privateInputs: [16n], // 16 < 18
      holderSigner: goEd25519Key(),
    }),
    /prover|constraint|satisf/i
  );
});
