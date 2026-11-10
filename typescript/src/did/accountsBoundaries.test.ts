// Copyright 2024-2026 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Part 25f3, the cut of accounts.ts: each boundary and each refusal of the account standards held to its own words. The shared vectors (vectors.test.ts) say that a string is refused; these say WHICH rule
// refused it, so a mutant that lets the next rule refuse in its place (the same verdict, other words) is told apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AccountStandardError,
  base58CheckDecode,
  base58CheckEncode,
  base58Decode,
  base58Encode,
  bech32Decode,
  bech32Encode,
  convertBits,
  parseBitcoinAddress,
} from './accounts';

const MAINNET = '000000000019d6689c085ae165831e93';

function refuses(fn: () => unknown, pattern: RegExp): void {
  assert.throws(fn, (e: unknown) => e instanceof AccountStandardError && pattern.test(e.message), `expected a refusal matching ${pattern}`);
}

function segwit(hrp: string, witnessVersion: number, program: number[], variant: 'bech32' | 'bech32m'): string {
  return bech32Encode(hrp, [witnessVersion, ...convertBits(Uint8Array.from(program), 8, 5, true)], variant);
}

test('base58: leading zero bytes are leading ones, and an all-zero string round-trips', () => {
  for (const bytes of [[], [0], [0, 0, 0], [0, 0, 1], [1, 0, 0], [255, 0, 255]]) {
    const text = base58Encode(Uint8Array.from(bytes));
    assert.deepEqual(Array.from(base58Decode(text) ?? []), bytes, text);
  }
  assert.equal(base58Encode(new Uint8Array(3)), '111');
  assert.equal(base58Encode(Uint8Array.from([0, 0, 1])), '112');
  assert.deepEqual(Array.from(base58Decode('11') ?? []), [0, 0]);
  assert.equal(base58Decode('0OIl'), null);
});

test('base58check: five bytes (a version and no payload) decode, four do not, and every checksum byte is held', () => {
  const empty = base58CheckEncode(new Uint8Array(0), 0x05);
  const decoded = base58CheckDecode(empty);
  assert.ok(decoded !== null && decoded.version === 5 && decoded.payload.length === 0, 'a version byte with an empty payload');
  assert.equal(base58CheckDecode(base58Encode(Uint8Array.from([1, 2, 3, 4]))), null, 'four bytes hold no checksum and no version');
  assert.equal(base58CheckDecode(base58Encode(new Uint8Array(0))), null);
  assert.equal(base58CheckDecode('0not-base58'), null);
  const good: Uint8Array | null = base58Decode(base58CheckEncode(Uint8Array.from([7, 8, 9]), 0x00));
  assert.ok(good !== null && base58CheckDecode(base58Encode(good)) !== null);
  const goodBytes: Uint8Array = good as Uint8Array;
  for (let i = 0; i < 4; i++) {
    const flipped: Uint8Array = Uint8Array.from(goodBytes);
    flipped[flipped.length - 4 + i] ^= 1;
    assert.equal(base58CheckDecode(base58Encode(flipped)), null, `checksum byte ${i}`);
  }
});

test('bech32: the human-readable part is 1 to 83 characters of 33..126, each refused in its own words', () => {
  const data = [0, 1, 2];
  refuses(() => bech32Encode('', data, 'bech32'), /is 0 characters, want 1 to 83/);
  refuses(() => bech32Encode('a'.repeat(84), data, 'bech32'), /is 84 characters, want 1 to 83/);
  const longest = bech32Encode('a'.repeat(83), data, 'bech32');
  assert.equal(bech32Decode(longest).hrp, 'a'.repeat(83));
  assert.equal(bech32Decode(bech32Encode('a', data, 'bech32')).hrp, 'a');
  // 33 ('!') and 126 ('~') are the ends of the range and are allowed; 32 and 127 are not
  for (const hrp of ['a!b', '!', '~', 'a~b', '!~']) {
    assert.equal(bech32Decode(bech32Encode(hrp, data, 'bech32')).hrp, hrp);
  }
  refuses(() => bech32Encode('a b', data, 'bech32'), /outside 33\.\.126 at 1/);
  refuses(() => bech32Encode('a\x7fb', data, 'bech32'), /outside 33\.\.126 at 1/);
  refuses(() => bech32Encode('ab\x1f', data, 'bech32'), /outside 33\.\.126 at 2/);
  refuses(() => bech32Encode('AB', data, 'bech32'), /must be lower-case/);
  // decoding holds the same range, before it reads the checksum
  refuses(() => bech32Decode(' 1nwldj5'), /outside 33\.\.126 at 0/);
  refuses(() => bech32Decode('\x7f1axkwrx'), /outside 33\.\.126 at 0/);
});

test('bech32: the length of a string is 8 to the limit, and a data value is a 5-bit group', () => {
  refuses(() => bech32Decode('abcdefg'), /is 7 characters, want 8 to 255/);
  refuses(() => bech32Decode(''), /is 0 characters, want 8 to 255/);
  const ok = bech32Encode('abc', [0, 1, 2, 3], 'bech32');
  assert.equal(ok.length, 14);
  assert.equal(bech32Decode(ok, 14).hrp, 'abc');
  refuses(() => bech32Decode(ok, 13), /is 14 characters, want 8 to 13/);
  refuses(() => bech32Decode('a'.repeat(256)), /is 256 characters, want 8 to 255/);
  refuses(() => bech32Encode('abc', [32], 'bech32'), /is not a 5-bit group/);
  refuses(() => bech32Encode('abc', [-1], 'bech32'), /is not a 5-bit group/);
  refuses(() => bech32Encode('abc', [0, 31, 33], 'bech32'), /is not a 5-bit group/);
  for (const value of [0, 1, 30, 31]) assert.deepEqual(bech32Decode(bech32Encode('abc', [value], 'bech32')).data, [value]);
});

test('convertBits: padding adds a group only for the bits that remain', () => {
  assert.equal(convertBits(Uint8Array.from([255, 255, 255, 255, 255]), 8, 5, true).length, 8, 'forty bits are eight groups and no ninth');
  assert.equal(convertBits(Uint8Array.from([255]), 8, 5, true).length, 2);
  assert.equal(convertBits(Uint8Array.from([255, 255]), 8, 5, true).length, 4);
  assert.equal(convertBits(Uint8Array.from([]), 8, 5, true).length, 0);
  assert.deepEqual(convertBits(Uint8Array.from([255]), 8, 5, true), [31, 28]);
  refuses(() => convertBits([32], 5, 8, false), /does not fit its source group width/);
  refuses(() => convertBits([1], 5, 8, false), /padding bits are not zero/);
  assert.deepEqual(convertBits([31, 28], 5, 8, false), [255]);
});

test('bip122 segwit: each refusal is in the words of the rule that makes it', () => {
  const p20 = Array.from({ length: 20 }, (_, i) => i + 1);
  const p32 = Array.from({ length: 32 }, (_, i) => i + 1);
  // a human-readable part that begins with the network's own, followed by a separator, and is not the network's
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc1x', 0, p20, 'bech32')), /has the human-readable part "bc1x", and mainnet uses "bc"/);
  // no witness version at all, and a version with no program
  refuses(() => parseBitcoinAddress(MAINNET, bech32Encode('bc', [], 'bech32')), /carries no witness version/);
  refuses(() => parseBitcoinAddress(MAINNET, bech32Encode('bc', [0], 'bech32')), /is witness version 0 with a 0-byte program/);
  refuses(() => parseBitcoinAddress(MAINNET, bech32Encode('bc', [1], 'bech32m')), /is witness version 1 with a 0-byte program/);
  // the checksum of each version
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 0, p20, 'bech32m')), /is witness version 0 with a bech32m checksum/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 0, p32, 'bech32m')), /is witness version 0 with a bech32m checksum/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 1, p32, 'bech32')), /is witness version 1 with a bech32 checksum/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 2, p32, 'bech32')), /is witness version 2 with a bech32 checksum/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 16, p20, 'bech32')), /is witness version 16 with a bech32 checksum/);
  // a program the standard allows and the method does not call an account
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 1, p20, 'bech32m')), /is witness version 1 with a 20-byte program/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 2, p32, 'bech32m')), /is witness version 2 with a 32-byte program/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 0, Array.from({ length: 21 }, (_, i) => i), 'bech32')), /is witness version 0 with a 21-byte program/);
  refuses(() => parseBitcoinAddress(MAINNET, segwit('bc', 0, Array.from({ length: 33 }, (_, i) => i), 'bech32')), /is witness version 0 with a 33-byte program/);
  // and the three that are accounts
  assert.equal(parseBitcoinAddress(MAINNET, segwit('bc', 0, p20, 'bech32')).kind, 'p2wpkh');
  assert.equal(parseBitcoinAddress(MAINNET, segwit('bc', 0, p32, 'bech32')).kind, 'p2wsh');
  assert.equal(parseBitcoinAddress(MAINNET, segwit('bc', 1, p32, 'bech32m')).kind, 'p2tr');
  const tr = parseBitcoinAddress(MAINNET, segwit('bc', 1, p32, 'bech32m'));
  assert.equal(tr.payloadHex, p32.map((b) => b.toString(16).padStart(2, '0')).join(''));
  assert.equal(tr.network, 'mainnet');
});
