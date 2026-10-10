// AssemblyScript SDK: the governance host imports.
//
// The compiled AssemblyScript (build/governance-probe.wasm, built from
// test/governance-probe.ts) runs against a recording host. The host is the only
// thing stubbed; the code under test is the SDK's real compiled wrappers.
//
// Three questions:
//   1. Does every import the SDK's governance wrappers make exist in host.ts's
//      declarations, and is each the name the platform EXPORTS? (infrix-core's
//      pkg/executor TestASSDKHostImportsAreServedByThePlatform holds host.ts to
//      the platform's instantiated module.)
//   2. Does each wrapper pass the host exactly what it was given, in the order
//      and widths the platform reads?
//   3. Does each wrapper read the host's answer the way the platform means it
//      (a refusal is null / "" / false, never a different answer)?

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const probePath = join(pkgRoot, 'build', 'governance-probe.wasm');
const hostSource = readFileSync(join(pkgRoot, 'assembly', 'host.ts'), 'utf8');

/** The imports the platform's "infrix" module exports for the governance family. */
const EXPECTED_IMPORTS = [
  'host_governance_create_object',
  'host_governance_get_evidence',
  'host_governance_get_intent_status',
  'host_governance_grant_capability',
  'host_governance_has_capability',
  'host_governance_has_role',
  'host_governance_require_approval',
  'host_governance_transition_object',
  'host_object_read',
  'host_policy_evaluate',
];

/** Instantiate the probe against a host whose every import is `handlers[name]`. */
async function instantiate(handlers) {
  const module = await WebAssembly.compile(readFileSync(probePath));
  const calls = [];
  let exp;
  const imports = { infrix: {} };
  for (const name of EXPECTED_IMPORTS) {
    imports.infrix[name] = (...args) => {
      calls.push({ name, args });
      const h = handlers[name];
      if (!h) throw new Error(`unexpected host call ${name}`);
      return h(exp, ...args);
    };
  }
  const instance = await WebAssembly.instantiate(module, imports);
  exp = instance.exports;
  const mem = () => new Uint8Array(exp.memory.buffer);
  const base = () => exp.scratchPtr();
  /** Write the inputs back to back at scratch[0]; returns their lengths. */
  const put = (...parts) => {
    let off = 0;
    const lens = [];
    for (const p of parts) {
      const b = typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p);
      mem().set(b, base() + off);
      off += b.length;
      lens.push(b.length);
    }
    return lens;
  };
  const text = (ptr, len) => Buffer.from(mem().slice(ptr, ptr + len)).toString('utf8');
  const result = (n) => (n < 0 ? null : Buffer.from(mem().slice(base(), base() + n)).toString('utf8'));
  return { module, exp, calls, put, text, result };
}

/** A host handler that answers `code` (a number) or writes `data` at the out pointer. */
const answers = (reply, outFromEnd = 2) => (exp, ...args) => {
  const r = typeof reply === 'function' ? reply(exp, ...args) : reply;
  if (typeof r === 'number') return r;
  const out = args[args.length - outFromEnd]; // (…, output_ptr, output_max) — or (…, output_ptr) when outFromEnd is 1
  const b = Buffer.from(r, 'utf8');
  new Uint8Array(exp.memory.buffer).set(b, out);
  return b.length;
};

// ---------------------------------------------------------------------------
// 1. Imports
// ---------------------------------------------------------------------------

function declared(source) {
  return [...source.matchAll(/@external\("infrix",\s*"(\w+)"\)/g)].map((m) => m[1]);
}

test('the governance wrappers import exactly the family the platform exports, and host.ts declares each', async () => {
  const module = await WebAssembly.compile(readFileSync(probePath));
  const imports = WebAssembly.Module.imports(module).map((i) => `${i.module}.${i.name}`).sort();
  assert.deepEqual(imports, EXPECTED_IMPORTS.map((n) => `infrix.${n}`).sort());
  const have = new Set(declared(hostSource));
  for (const n of EXPECTED_IMPORTS) assert.ok(have.has(n), `${n} is imported but host.ts does not declare it`);
  // The names the platform has NEVER exported: a module importing one fails to LINK.
  for (const dead of ['host_governance_get_object', 'host_governance_evaluate_policy', 'host_governance_submit_intent']) {
    assert.ok(!have.has(dead), `host.ts still declares ${dead}, which the platform does not export`);
  }
});

// ---------------------------------------------------------------------------
// 2 + 3. Arguments and answers
// ---------------------------------------------------------------------------

test('getIntentStatus passes the id and a bounded buffer, returns the status word, "" on a refusal', async () => {
  const { exp, calls, put, text } = await instantiate({
    host_governance_get_intent_status: answers((e, idPtr, idLen) => {
      return text(idPtr, idLen) === 'intent-1' ? 'completed' : -5;
    }),
  });
  const [n] = put('intent-1');
  const len = exp.pGetIntentStatus(n);
  assert.equal(Buffer.from(new Uint8Array(exp.memory.buffer).slice(exp.scratchPtr(), exp.scratchPtr() + len)).toString(), 'completed');
  assert.equal(calls[0].args.length, 4, 'id ptr, id len, out ptr, out max');
  assert.ok(calls[0].args[3] > 0 && calls[0].args[3] <= 4096, 'the output buffer is bounded');
  const [m] = put('someone-elses');
  assert.equal(exp.pGetIntentStatus(m), 0, 'a refusal is the empty string');
});

test('createObject submits the type and the fields verbatim and returns the CHILD INTENT id', async () => {
  const { exp, calls, put, text } = await instantiate({
    host_governance_create_object: answers((e, tp, tl, fp, fl) => {
      assert.equal(text(tp, tl), 'credential');
      assert.equal(text(fp, fl), '{"holder":"acc://alice.acme"}');
      return 'intent-child-7';
    }),
  });
  const [a, b] = put('credential', '{"holder":"acc://alice.acme"}');
  const n = exp.pCreateObject(a, b);
  assert.equal(Buffer.from(new Uint8Array(exp.memory.buffer).slice(exp.scratchPtr(), exp.scratchPtr() + n)).toString(), 'intent-child-7');
  assert.equal(calls[0].args.length, 6);
  assert.ok(calls[0].args[5] >= 64, 'the id buffer is too small for an intent id');
});

test('createObject / transitionObject / grantCapability return null when the host refuses', async () => {
  const refuse = answers(-31);
  const { exp, put } = await instantiate({
    host_governance_create_object: refuse,
    host_governance_transition_object: refuse,
    host_governance_grant_capability: refuse,
  });
  const [a, b] = put('credential', '{}');
  assert.equal(exp.pCreateObject(a, b), -1);
  const [c, d, e] = put('vault', 'v-1', 'closed');
  assert.equal(exp.pTransitionObject(c, d, e), -1);
  const lens = put('acc://bob.acme', 'storage:read', '', '*', 'operational');
  assert.equal(exp.pGrantCapability(...lens), -1);
});

test('transitionObject passes type, id and state and returns the child intent id', async () => {
  const { exp, put, text } = await instantiate({
    host_governance_transition_object: answers((e, tp, tl, ip, il, sp, sl) => {
      assert.deepEqual([text(tp, tl), text(ip, il), text(sp, sl)], ['vault', 'v-1', 'closed']);
      return 'intent-child-8';
    }),
  });
  const [a, b, c] = put('vault', 'v-1', 'closed');
  assert.equal(exp.pTransitionObject(a, b, c), 'intent-child-8'.length);
});

test('grantCapability passes grantee, capabilities, target, stage and purpose, in that order', async () => {
  const seen = [];
  const { exp, put, text } = await instantiate({
    host_governance_grant_capability: answers((e, ...a) => {
      for (let i = 0; i < 10; i += 2) seen.push(text(a[i], a[i + 1]));
      return 'intent-child-9';
    }),
  });
  const lens = put('acc://bob.acme', 'storage:read,token:read', 'acc://c.acme/ledger', '*', 'audit');
  assert.equal(exp.pGrantCapability(...lens), 'intent-child-9'.length);
  assert.deepEqual(seen, ['acc://bob.acme', 'storage:read,token:read', 'acc://c.acme/ledger', '*', 'audit']);
});

test('hasCapability / hasRole are true ONLY for a definite 1: a refusal code is never "yes"', async () => {
  // The wrappers used to read `result != 0` as true, so a negative result code
  // — a refusal — was reported as the capability being held.
  for (const [reply, want] of [[1, 1], [0, 0], [-1, 0], [-31, 0], [2, 0]]) {
    const { exp, put } = await instantiate({
      host_governance_has_capability: () => reply,
      host_governance_has_role: () => reply,
    });
    const [a, b] = put('acc://alice.acme', 'token:transfer');
    assert.equal(exp.pHasCapability(a, b), want, `hasCapability on ${reply}`);
    assert.equal(exp.pHasRole(a, b), want, `hasRole on ${reply}`);
  }
});

test('callerHasCapability asks with an EMPTY identity, which the platform resolves to the caller', async () => {
  const { exp, calls, put } = await instantiate({ host_governance_has_capability: () => 1 });
  const [n] = put('token:transfer');
  assert.equal(exp.pCallerHasCapability(n), 1);
  assert.equal(calls[0].args[1], 0, 'identity length');
  assert.equal(calls[0].args[3], 'token:transfer'.length);
});

test('requireApproval passes the role and threshold and is true only for a met requirement', async () => {
  for (const [reply, want] of [[1, 1], [0, 0], [-30, 0], [-1, 0]]) {
    const { exp, calls, put } = await instantiate({ host_governance_require_approval: () => reply });
    const [n] = put('compliance');
    assert.equal(exp.pRequireApproval(n, 2), want, `requireApproval on ${reply}`);
    assert.deepEqual(calls[0].args.slice(1), [n, 2], 'role length and threshold');
  }
});

test('evaluatePolicy takes a policy TYPE only and returns the decision bytes, null when unanswered', async () => {
  const { exp, calls, put, text } = await instantiate({
    host_policy_evaluate: answers((e, tp, tl) => (text(tp, tl) === 'contract:call' ? '{"allowed":true}' : -29), 1),
  });
  const [n] = put('contract:call');
  const len = exp.pEvaluatePolicy(n);
  assert.equal(Buffer.from(new Uint8Array(exp.memory.buffer).slice(exp.scratchPtr(), exp.scratchPtr() + len)).toString(), '{"allowed":true}');
  assert.equal(calls[0].args.length, 3, 'type ptr, type len, out ptr — no scope, no operands');
  const [m] = put('unknown:type');
  assert.equal(exp.pEvaluatePolicy(m), -1);
});

test('getObject reads through host_object_read and returns null when absent', async () => {
  const { exp, calls, put, text } = await instantiate({
    host_object_read: answers((e, tp, tl, ip, il) => (text(tp, tl) === 'vault' && text(ip, il) === 'v-1' ? '{"id":"v-1"}' : -1), 1),
  });
  const [a, b] = put('vault', 'v-1');
  const len = exp.pGetObject(a, b);
  assert.equal(Buffer.from(new Uint8Array(exp.memory.buffer).slice(exp.scratchPtr(), exp.scratchPtr() + len)).toString(), '{"id":"v-1"}');
  assert.equal(calls[0].args.length, 5);
  const [c, d] = put('vault', 'missing');
  assert.equal(exp.pGetObject(c, d), -1);
});

test('getEvidence passes the id and a bounded buffer and returns null on a refusal', async () => {
  const { exp, calls, put } = await instantiate({
    host_governance_get_evidence: answers((e, ip, il) => (il === 8 ? '{"bundle":1}' : -28)),
  });
  const [n] = put('intent-1');
  assert.equal(exp.pGetEvidence(n), '{"bundle":1}'.length);
  assert.equal(calls[0].args.length, 4);
  assert.ok(calls[0].args[3] >= 65536, 'a bundle needs the full 64 KiB buffer the SDKs reserve');
  const [m] = put('intent');
  assert.equal(exp.pGetEvidence(m), -1);
});
