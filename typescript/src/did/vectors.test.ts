// W.DID.CROSSSURFACE.PARITY: the shared did:infrix vector set, pinned in this SDK's CI.
//
// testdata/did-vectors-v1.json is the exact output of `infrix did vectors --out` in infrix core. The
// same file (same SHA-256) is pinned in infrix-schema and infrix-verify, and infrix core pins the digest
// of what it exports. A change to the DID rules therefore shows up as a visible, simultaneous change in
// every repository, not as a silent split.
//
// The SDK has a FORMATTER (createDID, formatAccDID, formatChainDID), so the construction vectors run
// through it in full. It has no parser, so the parse vectors are digest-pinned and structurally checked,
// and the canonical form of every Infrix-native valid vector is checked for the rules the SDK shares
// with core (idchars, upper-case percent escapes, lower-case network id).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatAccDID, formatChainDID, InfrixDIDError } from './v1';

const PINNED_SHA256 = 'e25a465a066cbdbf746ca7abefed35d6d39e908120a2925b1844d761fc5e63cb';
const raw = readFileSync(join(__dirname, '..', '..', 'testdata', 'did-vectors-v1.json'));
const set = JSON.parse(raw.toString('utf8')) as {
  spec: string;
  networkId: string;
  parse: { name: string; input: string; valid: boolean; canonical?: string; profile?: string; owner?: string; refusal?: string }[];
  construct: { name: string; profile: string; args: string[]; canonical: string }[];
};

test('the vector file is the one infrix core exports (digest pin)', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), PINNED_SHA256);
  assert.equal(set.spec, 'did-infrix-v1');
  assert.ok(set.parse.length >= 26 && set.construct.length >= 3);
});

test('PLANTED DEFECT: a one-byte edit of the vector file changes the digest', () => {
  const edited = Buffer.concat([raw, Buffer.from(' ')]);
  assert.notEqual(createHash('sha256').update(edited).digest('hex'), PINNED_SHA256);
});

test('every construction vector is produced by the SDK formatter', () => {
  for (const v of set.construct) {
    const got = v.profile === 'acc' ? formatAccDID(set.networkId, v.args[0]) : formatChainDID(v.args[0], v.args[1], v.args[2]);
    assert.equal(got, v.canonical, `construction vector ${JSON.stringify(v.name)}`);
  }
});

test('PLANTED DEFECT: a formatter that kept case or skipped NFC would not reproduce the vectors', () => {
  const caseKept = (account: string) => `did:infrix:v1:acc:${set.networkId}:${account.replace('acc://', '').split('/').join(':')}`;
  const v = set.construct.find((c) => c.name.includes('case-insensitive'))!;
  assert.notEqual(caseKept(v.args[0]), v.canonical, 'the case-keeping formatter must differ from the vector');
});

test('the SDK refuses what core refuses at construction', () => {
  const refuse = (fn: () => unknown, reason: string) =>
    assert.throws(fn, (e: unknown) => e instanceof InfrixDIDError && e.reason === reason, `expected ${reason}`);
  refuse(() => formatAccDID('kermit', 'acc://alice.acme'), 'network');
  refuse(() => formatAccDID('g1-' + '0'.repeat(64), 'acc://alice.acme'), 'network');
  refuse(() => formatAccDID(set.networkId, 'acc://alice.acme:8080'), 'malformed');
  refuse(() => formatAccDID(set.networkId, 'acc://user@alice.acme'), 'malformed');
  refuse(() => formatChainDID('tezos', '1', '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'), 'profile-semantics');
  refuse(() => formatChainDID('eip155', '1', '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD'), 'profile-semantics');
});

test('every valid Infrix-native vector is canonical under the rules the SDK shares', () => {
  for (const v of set.parse.filter((p) => p.valid && p.owner === 'infrix')) {
    assert.equal(v.canonical, v.input, v.name);
    const segments = v.input.split(':').slice(4);
    for (const s of segments) {
      assert.match(s, /^([A-Za-z0-9._-]|%[0-9A-F]{2})+$/, `${v.name}: segment ${s} uses a non-idchar or a lower-case escape`);
    }
    if (v.profile === 'acc' || v.profile === 'anon') assert.equal(segments[0], set.networkId, v.name);
  }
  // The refusal vectors that name a legacy or mutable spelling are never produced by the formatter.
  const legacy = set.parse.find((p) => p.refusal === 'legacy-input')!;
  assert.notEqual(formatAccDID(set.networkId, 'acc://alice.acme'), legacy.input);
});
