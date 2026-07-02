// @infrix/prover — lazy-loaded WebAssembly selective-disclosure prover (DX P1-3b).
//
// Generate ZK predicate proofs client-side in the browser or Node. The private
// witness is marshalled to the in-process WASM module and NEVER serialized off
// the device — only the resulting public envelope is returned (and is exactly
// the shape `client.predicates.verify` accepts).
//
// Usage:
//   import { loadProver } from '@infrix/prover';
//   const prover = await loadProver();
//   const envelope = await prover.prove({
//     predicate: 'threshold_gte',
//     publicInputs: [18n],
//     privateInputs: [21n],
//     holderSigner: ed25519PrivateKey,   // Uint8Array (64-byte Go format)
//     purpose: 'age-over-18',
//   });
//   // submit `envelope` to client.predicates.verify(...)

let instancePromise = null;

/**
 * Load (once) the WASM prover and return a { prove, verify } handle. Subsequent
 * calls return the cached instance. The 16 MB module is instantiated lazily, so
 * importing this package costs nothing until you call loadProver().
 *
 * @param {{ assetsDir?: string, baseUrl?: string|URL }} [opts]
 */
export async function loadProver(opts = {}) {
  if (!instancePromise) instancePromise = instantiate(opts);
  await instancePromise;
  return { prove, verify };
}

function isNode() {
  return typeof process !== 'undefined' && !!process.versions?.node;
}

async function instantiate(opts) {
  const { wasmBytes, wasmExecSource, manifest } = isNode()
    ? await readAssetsNode(opts)
    : await readAssetsBrowser(opts);

  await assertSha256(wasmBytes, manifest.wasmSha256);

  // Run Go's wasm runtime shim; it defines globalThis.Go.
  await runWasmExec(wasmExecSource);
  const go = new globalThis.Go();
  const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
  go.run(instance); // do NOT await — main() blocks on select{} to stay resident.

  for (let i = 0; i < 1000 && !globalThis.__infrixProverReady; i++) {
    await new Promise((r) => (isNode() ? setImmediate(r) : setTimeout(r, 0)));
  }
  if (!globalThis.__infrixProverReady) throw new Error('@infrix/prover: WASM prover did not become ready');
}

// ---- prove / verify -------------------------------------------------------

/**
 * Generate a predicate proof. Big integers accept bigint | number | string;
 * keys/nonces accept Uint8Array. Returns the public PredicateProof envelope.
 *
 * Async by contract: Groth16 proving is a multi-second CPU operation. On the
 * main thread it still blocks while computing — run the prover in a Web Worker
 * for a non-blocking UI (see the package README).
 */
async function prove(request) {
  const dto = toDTO(request);
  const r = globalThis.__infrixPredicateProve(JSON.stringify(dto));
  if (!r.ok) throw new Error('@infrix/prover: ' + r.error);
  return JSON.parse(r.data);
}

/** Self-check an envelope against the in-module trusted setup (no node). */
async function verify(envelope) {
  const s = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  const r = globalThis.__infrixPredicateVerify(s);
  if (!r.ok) throw new Error('@infrix/prover verify: ' + r.error);
  return JSON.parse(r.data);
}

function toDecimalStrings(arr, label) {
  if (!Array.isArray(arr)) throw new Error(`@infrix/prover: ${label} must be an array`);
  return arr.map((v) => {
    if (typeof v === 'bigint') return v.toString(10);
    if (typeof v === 'number') return Math.trunc(v).toString(10);
    if (typeof v === 'string') return v;
    throw new Error(`@infrix/prover: ${label} entries must be bigint | number | string`);
  });
}

function toHex(u8, label) {
  if (u8 == null) return undefined;
  if (!(u8 instanceof Uint8Array)) throw new Error(`@infrix/prover: ${label} must be a Uint8Array`);
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toDTO(req) {
  if (!req || typeof req !== 'object') throw new Error('@infrix/prover: request object required');
  const holderSignerHex = toHex(req.holderSigner, 'holderSigner');
  if (!holderSignerHex) throw new Error('@infrix/prover: holderSigner (Uint8Array) is required');
  return {
    predicate: req.predicate,
    setSize: req.setSize ?? 0,
    publicInputs: toDecimalStrings(req.publicInputs ?? [], 'publicInputs'),
    privateInputs: toDecimalStrings(req.privateInputs ?? [], 'privateInputs'),
    holderSignerHex,
    holderDid: req.holderDID,
    nullifierKeyHex: toHex(req.nullifierKey, 'nullifierKey'),
    grantId: req.grantId,
    purpose: req.purpose,
    domain: req.domain,
    challengeHex: toHex(req.challenge, 'challenge'),
    issuedAtBlock: req.issuedAtBlock,
  };
}

// ---- environment adapters -------------------------------------------------

async function readAssetsNode(opts) {
  const [{ readFileSync }, path, { fileURLToPath }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
    import('node:url'),
  ]);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = opts.assetsDir || path.join(here, '..', 'assets');
  return {
    wasmBytes: new Uint8Array(readFileSync(path.join(dir, 'infrix-prover.wasm'))),
    wasmExecSource: readFileSync(path.join(dir, 'wasm_exec.js'), 'utf8'),
    manifest: JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')),
  };
}

async function readAssetsBrowser(opts) {
  const base = opts.baseUrl ? new URL(opts.baseUrl) : new URL('../assets/', import.meta.url);
  const [wasmResp, execResp, manifestResp] = await Promise.all([
    fetch(new URL('infrix-prover.wasm', base)),
    fetch(new URL('wasm_exec.js', base)),
    fetch(new URL('manifest.json', base)),
  ]);
  return {
    wasmBytes: new Uint8Array(await wasmResp.arrayBuffer()),
    wasmExecSource: await execResp.text(),
    manifest: await manifestResp.json(),
  };
}

async function runWasmExec(source) {
  if (isNode()) {
    const vm = await import('node:vm');
    vm.runInThisContext(source, { filename: 'wasm_exec.js' });
  } else {
    // Evaluate in global scope so it defines globalThis.Go.
    // eslint-disable-next-line no-eval
    (0, eval)(source);
  }
}

async function assertSha256(bytes, expectedHex) {
  if (!expectedHex) return; // no manifest hash → skip
  let actual;
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    actual = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    const { createHash } = await import('node:crypto');
    actual = createHash('sha256').update(bytes).digest('hex');
  }
  if (actual !== expectedHex) {
    throw new Error(`@infrix/prover: WASM integrity check failed (expected ${expectedHex.slice(0, 12)}…, got ${actual.slice(0, 12)}…)`);
  }
}
