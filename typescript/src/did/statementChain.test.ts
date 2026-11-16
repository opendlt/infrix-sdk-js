// The statement-chain verification held to infrix core's shared vectors (testdata/did-vectors-v1.json, the exact output of `infrix did vectors --out`, generated in core, never
// retyped): the canonicalJson, chainSignatures and anonHistory sections, plus planted cuts beyond the vectors' own scenarios.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha2';
import { CanonicalJSONError, JValue, canonicalizeJSON, canonicalNumber, parseJSON, writeCanonical } from './canonicalJson';
import { DerivationError, deriveDocument } from './derive';
import { DocumentRuleError, checkDocumentText } from './validate';
import {
  AnonHistory, AnonVerdict, StatementChainError, chainStatementMessage, cosmosADR036SignDoc, eip191PersonalMessageHash, hash160, parseChainDID, verifyAnonHistory, verifyChainSignature,
} from './statementChain';

const set = JSON.parse(readFileSync(join(__dirname, '..', '..', 'testdata', 'did-vectors-v1.json')).toString('utf8')) as {
  canonicalJson: { name: string; input: string; valid: boolean; canonical?: string; sha256?: string; refusal?: string }[];
  chainSignatures: { name: string; did: string; scheme: string; messageHex: string; signerHex: string; signatureHex: string; valid: boolean }[];
  anonHistory: { name: string; valid: boolean; refusal?: string; verdict?: AnonVerdict; history: AnonHistory }[];
};

const dec = new TextDecoder();

test('every canonical-json vector is reproduced, accepted or refused by name', () => {
  assert.ok(set.canonicalJson.length > 0);
  for (const v of set.canonicalJson) {
    if (v.valid) {
      const got = canonicalizeJSON(v.input);
      assert.equal(dec.decode(got), v.canonical, v.name);
      assert.equal(bytesToHex(sha256(got)), v.sha256, v.name);
    } else {
      assert.throws(() => canonicalizeJSON(v.input), (e: unknown) => e instanceof CanonicalJSONError && e.refusal === v.refusal, v.name);
    }
  }
});

test('the canonical number is ECMAScript\'s spelling and refuses what JSON does not write', () => {
  assert.equal(canonicalNumber('1E30'), '1e+30');
  assert.equal(canonicalNumber('-0'), '0');
  assert.equal(canonicalNumber('1152921504606847000'), '1152921504606847000');
  for (const bad of ['+1', '01', '1.', '.5', 'NaN', 'Infinity', '0x10']) assert.throws(() => canonicalNumber(bad), (e: unknown) => e instanceof CanonicalJSONError && e.refusal === 'not-json', bad);
  assert.throws(() => canonicalNumber('1152921504606846976'), (e: unknown) => e instanceof CanonicalJSONError && e.refusal === 'inexact-integer');
});

test('every chain-signature vector reaches its verdict through the namespace verifier', () => {
  const valid = new Set<string>();
  for (const v of set.chainSignatures) {
    const run = () => verifyChainSignature(parseChainDID(v.did), hexToBytes(v.messageHex), hexToBytes(v.signerHex), hexToBytes(v.signatureHex));
    if (v.valid) {
      run();
      valid.add(v.scheme);
    } else {
      assert.throws(run, (e: unknown) => e instanceof StatementChainError, v.name);
    }
  }
  assert.deepEqual([...valid].sort(), ['bip122:bip137', 'cosmos:adr036', 'eip155:eip191', 'solana:ed25519']);
});

test('the published standard vectors: EIP-191 hash, HASH160 of the generator key, the ADR-036 document', () => {
  assert.equal(bytesToHex(eip191PersonalMessageHash(new TextEncoder().encode('Some data'))), '1da44b586eb0729ff70a73c326926f6ed5a25f5b056e7f47fbc6e58d86871655');
  assert.equal(bytesToHex(hash160(hexToBytes('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'))), '751e76e8199196d454941c45d1b3a323f1433bd6');
  const address = 'cosmos1w508d6qejxtdg4y5r3zarvary0c5xw7k6ah60c';
  assert.equal(dec.decode(cosmosADR036SignDoc(new TextEncoder().encode('hello'), address)),
    `{"account_number":"0","chain_id":"","fee":{"amount":[],"gas":"0"},"memo":"","msgs":[{"type":"sign/MsgSignData","value":{"data":"aGVsbG8=","signer":"${address}"}}],"sequence":"0"}`);
  assert.equal(dec.decode(chainStatementMessage(new Uint8Array(32))).length, 88);
  for (const bad of ['did:infrix:v1:chain:eip155:1:0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'did:infrix:v1:chain:eip155:1', 'did:infrix:v1:chain:tezos:1:0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed']) {
    assert.throws(() => parseChainDID(bad), StatementChainError, bad);
  }
});

test('every anon-history vector reaches its verdict', () => {
  let valid = 0;
  let refused = 0;
  for (const v of set.anonHistory) {
    if (v.valid) {
      assert.deepEqual(verifyAnonHistory(v.history), v.verdict, v.name);
      valid++;
    } else {
      assert.throws(() => verifyAnonHistory(v.history), (e: unknown) => e instanceof StatementChainError && e.refusal === v.refusal, v.name);
      refused++;
    }
  }
  assert.ok(valid > 0 && refused > 0);
});

test('PLANTED CUTS: every tamper of the valid anon history is refused by its class', () => {
  // the tampers change the entries, so the history is taken without its ledger times (part 25j: the times are held to them in their own test)
  const { ledgerTimes: _times, ...ok } = set.anonHistory.find((v) => v.valid)!.history;
  const mutate = (index: number, edit: (e: any) => void): AnonHistory => {
    const entry = JSON.parse(Buffer.from(ok.entries[index], 'base64').toString('utf8'));
    edit(entry);
    const entries = [...ok.entries];
    entries[index] = Buffer.from(JSON.stringify(entry)).toString('base64');
    return { ...ok, entries };
  };
  const flip = (b64: string) => {
    const raw = Buffer.from(b64, 'base64');
    raw[0] ^= 1;
    return raw.toString('base64');
  };
  const cases: [string, AnonHistory, string][] = [
    ['a changed signature', mutate(2, (e) => (e.statement.signature = flip(e.statement.signature))), 'statement-chain-refused'],
    ['a changed signer', mutate(2, (e) => (e.statement.signer = flip(e.statement.signer))), 'statement-chain-refused'],
    ['a changed document', mutate(1, (e) => (e.document.alsoKnownAs = ['did:web:x'])), 'anon-history-refused'],
    ['a changed document hash', mutate(1, (e) => (e.hash = flip(e.hash))), 'anon-history-refused'],
    ['a changed stored operation', mutate(1, (e) => (e.statement.operations[0].service.description = 'x')), 'statement-chain-refused'],
    ['another sequence', mutate(1, (e) => (e.statement.sequence = 7)), 'statement-chain-refused'],
    ['another version', mutate(1, (e) => (e.metadata.versionId = '9')), 'statement-chain-refused'],
    ['another scheme', mutate(1, (e) => (e.statement.scheme = 'secp256k1')), 'statement-chain-refused'],
    ['another account', mutate(1, (e) => (e.identity.accountUrl = 'acc://registry.acme/did-anon-x')), 'anon-history-refused'],
    ['a member the envelope does not define', mutate(1, (e) => (e.extra = true)), 'anon-history-refused'],
    ['another hash algorithm', mutate(1, (e) => (e.hashAlgorithm = 'sha-256/infrix-document-json-v1')), 'anon-history-refused'],
    ['another envelope version', mutate(1, (e) => (e.version = 1)), 'anon-history-refused'],
    ['a deactivated genesis', mutate(0, (e) => (e.metadata.deactivated = true)), 'statement-chain-refused'],
    ['migration evidence', mutate(1, (e) => (e.migration = {})), 'anon-history-refused'],
  ];
  for (const [name, h, refusal] of cases) {
    assert.throws(() => verifyAnonHistory(h), (e: unknown) => e instanceof StatementChainError && e.refusal === refusal, name);
  }
  // a duplicate member in an entry's text is refused (I-JSON), never read as its last value
  const raw = Buffer.from(ok.entries[1], 'base64').toString('utf8').replace('"version":2', '"version":2,"version":2');
  const entries = [...ok.entries];
  entries[1] = Buffer.from(raw).toString('base64');
  assert.throws(() => verifyAnonHistory({ ...ok, entries }), (e: unknown) => e instanceof StatementChainError && e.refusal === 'anon-history-refused' && /I-JSON/.test(e.message));
  for (const bad of [{ ...ok, did: 'did:infrix:v1:anon:x' }, { ...ok, registry: 'acc://a/b' }, { ...ok, entries: ['!'] }, { ...ok, entries: [] }]) {
    assert.throws(() => verifyAnonHistory(bad), (e: unknown) => e instanceof StatementChainError && e.refusal === 'anon-history-refused');
  }
});

test('every document-derivation vector is reproduced, and the authentic histories over a document the operations do not yield are refused', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '..', '..', 'testdata', 'did-vectors-v1.json')).toString('utf8')) as {
    documentDerivation: { base: unknown; cases: { name: string; operations: Record<string, unknown>[]; valid: boolean; document?: string; sha256?: string }[] };
  };
  const base = parseJSON(JSON.stringify(file.documentDerivation.base));
  let valid = 0;
  let refused = 0;
  for (const c of file.documentDerivation.cases) {
    const ops = c.operations.map((o) => {
      const parsed = parseJSON(JSON.stringify(o)) as { obj: Map<string, JValue> };
      return { type: parsed.obj.get('type') as string, members: parsed.obj };
    });
    if (!c.valid) {
      assert.throws(() => deriveDocument(base, ops), DerivationError, c.name);
      refused++;
      continue;
    }
    const derived = deriveDocument(base, ops);
    assert.equal(writeCanonical(derived), c.document, c.name);
    assert.equal(bytesToHex(sha256(new TextEncoder().encode(writeCanonical(derived)))), c.sha256, c.name);
    valid++;
  }
  assert.ok(valid > 0 && refused > 0);
  for (const v of set.anonHistory.filter((x) => /underived|misordered/.test(x.name))) {
    assert.throws(() => verifyAnonHistory(v.history), (e: unknown) => e instanceof StatementChainError && e.refusal === 'statement-chain-refused' && /operations (do not apply|yield)/.test(e.message), v.name);
  }
});

test('every chain-history vector reaches its verdict', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '..', '..', 'testdata', 'did-vectors-v1.json')).toString('utf8')) as {
    chainHistory: { name: string; valid: boolean; refusal?: string; verdict?: AnonVerdict; history: AnonHistory }[];
  };
  let valid = 0;
  let refused = 0;
  for (const v of file.chainHistory) {
    if (v.valid) {
      assert.deepEqual(verifyAnonHistory(v.history), v.verdict, v.name);
      valid++;
    } else {
      assert.throws(() => verifyAnonHistory(v.history), (e: unknown) => e instanceof StatementChainError && e.refusal === v.refusal, v.name);
      refused++;
    }
  }
  assert.ok(valid === 1 && refused > 0);
});

test('every document-validity vector reaches its verdict under the document rules', () => {
  const file = JSON.parse(readFileSync(join(__dirname, '..', '..', 'testdata', 'did-vectors-v1.json')).toString('utf8')) as {
    documentValidity: { name: string; document: unknown; valid: boolean }[];
  };
  assert.ok(file.documentValidity.length > 0);
  for (const v of file.documentValidity) {
    const run = () => checkDocumentText(JSON.stringify(v.document));
    if (v.valid) run();
    else assert.throws(run, DocumentRuleError, v.name);
  }
});
