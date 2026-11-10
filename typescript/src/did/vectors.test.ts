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
import { bech32Decode, bech32Encode, convertBits, base58CheckDecode, base58CheckEncode, base58Decode, base58Encode, parseBitcoinAddress } from './accounts';

const PINNED_SHA256 = '78f95ed25bdb9164fceea9360065b3d7adf638c0ab454ee5fba824d87df5d9e3';
const raw = readFileSync(join(__dirname, '..', '..', 'testdata', 'did-vectors-v1.json'));
const set = JSON.parse(raw.toString('utf8')) as {
  spec: string;
  networkId: string;
  parse: { name: string; input: string; valid: boolean; canonical?: string; profile?: string; owner?: string; refusal?: string }[];
  construct: { name: string; profile: string; args: string[]; canonical: string }[];
  bech32: { name: string; input: string; valid: boolean; hrp?: string; variant?: string; maxLength: number }[];
  chainAccounts: { name: string; namespace: string; reference: string; account: string; valid: boolean; canonical?: string; kind?: string; payloadHex?: string }[];
  anonHistory: { name: string; scenario: string; valid: boolean; refusal?: string; history: { did: string; registry: string; entries: string[] } }[];
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

// THE ACCOUNT STANDARDS (infrix core part 25f2, row D2). The vector file carries the standards' published vectors from the
// Go side (the source): BIP-173 and BIP-350 for the bech32 codec and Bitcoin's segwit addresses, the Bitcoin wiki's base58check
// addresses, and Solana's and Cosmos's own. The SDK implements the same standards (accounts.ts) and is held to every vector.

test('the vector file carries the account-standard sections, both kinds of vector in each', () => {
  assert.ok(set.bech32.length >= 24 && set.bech32.some((v) => v.valid) && set.bech32.some((v) => !v.valid));
  for (const namespace of ['bip122', 'solana', 'cosmos']) {
    const mine = set.chainAccounts.filter((v) => v.namespace === namespace);
    assert.ok(mine.some((v) => v.valid) && mine.some((v) => !v.valid), `${namespace} needs a valid and a refused account vector`);
  }
});

test('every bech32 vector decodes, or is refused, as BIP-173 and BIP-350 say', () => {
  for (const v of set.bech32) {
    if (v.valid) {
      const got = bech32Decode(v.input, v.maxLength);
      assert.equal(got.hrp, v.hrp, v.name);
      assert.equal(got.variant, v.variant, v.name);
      // the encoder is the decoder's inverse, in the variant the string carries
      assert.equal(bech32Encode(got.hrp, got.data, got.variant), v.input.toLowerCase(), v.name);
    } else {
      assert.throws(() => bech32Decode(v.input, v.maxLength), `${v.name}: ${JSON.stringify(v.input)} was accepted`);
    }
  }
});

test('every account vector is read by the standard of its chain', () => {
  for (const v of set.chainAccounts) {
    if (v.valid) {
      const did = formatChainDID(v.namespace, v.reference, v.account);
      assert.ok(did.endsWith(':' + v.canonical), `${v.name}: ${did} does not end with the canonical account ${v.canonical}`);
      if (v.namespace === 'bip122') {
        const parsed = parseBitcoinAddress(v.reference, v.account);
        assert.equal(parsed.kind, v.kind, v.name);
        assert.equal(parsed.payloadHex, v.payloadHex, v.name);
      }
    } else {
      assert.throws(
        () => formatChainDID(v.namespace, v.reference, v.account),
        (e: unknown) => e instanceof InfrixDIDError && e.reason === 'profile-semantics',
        `${v.name}: ${JSON.stringify(v.account)} was accepted`,
      );
    }
  }
});

test('every chain parse vector of the shared set is judged as core judges it', () => {
  const chain = set.parse.filter((p) => p.input.startsWith('did:infrix:v1:chain:') && p.input.split(':').length === 7);
  assert.ok(chain.length >= 12, 'the set carries the chain parse vectors');
  for (const p of chain) {
    const [, , , , namespace, reference, account] = p.input.split(':');
    if (p.valid) {
      assert.equal(formatChainDID(namespace, reference, account), p.canonical, p.name);
    } else if (p.refusal === 'profile-semantics') {
      assert.throws(() => formatChainDID(namespace, reference, account), (e: unknown) => e instanceof InfrixDIDError && e.reason === 'profile-semantics', p.name);
    } else if (p.refusal === 'non-canonical') {
      // the formatter canonicalizes a spelling the parser refuses: it never mints the non-canonical string
      assert.notEqual(formatChainDID(namespace, reference, account), p.input, p.name);
    }
  }
});

test('the base58 and base58check codecs are exact inverses, including leading zero bytes', () => {
  for (const hex of ['', '00', '0000', '00ff', 'ff', '0100', '62e907b15cbf27d5425399ebf6f0fb50ebb88f18', '000000000019d6689c085ae165831e93']) {
    const bytes = Uint8Array.from(hex.match(/../g)?.map((pair) => parseInt(pair, 16)) ?? []);
    assert.deepEqual(base58Decode(base58Encode(bytes)), bytes, hex);
  }
  assert.equal(base58Decode('0OIl'), null, 'characters outside the alphabet');
  // the Bitcoin genesis coinbase address: version 0x00, the published hash160
  const decoded = base58CheckDecode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')!;
  assert.equal(decoded.version, 0);
  assert.equal(Buffer.from(decoded.payload).toString('hex'), '62e907b15cbf27d5425399ebf6f0fb50ebb88f18');
  assert.equal(base58CheckEncode(decoded.payload, decoded.version), '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  assert.equal(base58CheckDecode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb'), null, 'a mutated checksum');
  assert.equal(base58CheckDecode('1111'), null, 'shorter than a checksum and a version');
});

test('the bit regrouping refuses non-canonical padding exactly as BIP-173 says', () => {
  assert.deepEqual(convertBits([0xff], 8, 5, true), [31, 28]);
  assert.deepEqual(convertBits([31, 31, 31, 31, 31, 31, 31, 31], 5, 8, false), [255, 255, 255, 255, 255]);
  assert.throws(() => convertBits([31, 31, 31, 31, 31, 31, 31, 31, 31], 5, 8, false), 'non-zero padding');
  assert.throws(() => convertBits([0, 0, 0, 0, 0, 0, 0, 0, 0], 5, 8, false), 'a whole group of padding');
  assert.throws(() => convertBits([32], 5, 8, false), 'a value above the group width');
});

test('the anon statement-chain vectors are present and digest-pinned (the SDK has no statement-chain verifier yet)', () => {
  assert.equal(set.anonHistory.length, 8);
  assert.equal(set.anonHistory.filter((v) => v.valid).length, 1);
  for (const v of set.anonHistory) {
    assert.ok(v.history.did.startsWith('did:infrix:v1:anon:' + set.networkId + ':'), v.name);
    assert.ok(v.history.entries.length >= 5, v.name);
    if (!v.valid) assert.match(v.refusal ?? '', /^(statement-chain-refused|anon-history-refused)$/, v.name);
  }
});
