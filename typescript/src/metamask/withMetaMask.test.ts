/**
 * withMetaMask orchestration tests (Priority 01).
 *
 * A deterministic mock EIP-1193 provider signs personal_sign correctly (so key
 * recovery yields the real address) and records call order; a mock client stubs
 * the canonical eip712/intent/evidence surface. These assert the consumer path
 * connects -> recovers -> prepares -> signs -> submits -> waits -> exports proof,
 * embeds the RECOVERED public key, uses NO raw-mutation provider methods, and
 * fails closed on missing capabilities / rejection / address mismatch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes, concatBytes, hexToBytes } from '@noble/hashes/utils';

import { withMetaMask } from './index';
import { MetaMaskAddressMismatch, MetaMaskUserRejected } from './errors';
import type { InfrixClient } from '../index';

const PRIV = hexToBytes('4c0883a69102937d6231471b5dbb6204fe512961708279f2e3e8a5d4b8e3e3e3');
const PUB_UNCOMPRESSED = secp256k1.getPublicKey(PRIV, false);
const ADDRESS = '0x' + bytesToHex(keccak_256(PUB_UNCOMPRESSED.subarray(1)).subarray(12));
const PUB_COMPRESSED = '0x' + bytesToHex(secp256k1.getPublicKey(PRIV, true));

function personalSign(message: string, priv: Uint8Array): string {
  const msg = utf8ToBytes(message);
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`);
  const digest = keccak_256(concatBytes(prefix, msg));
  const sig = secp256k1.sign(digest, priv);
  const rsv = new Uint8Array(65);
  rsv.set(sig.toCompactRawBytes(), 0);
  rsv[64] = 27 + sig.recovery;
  return '0x' + bytesToHex(rsv);
}

/** A mock EIP-1193 provider that records call order. */
function mockProvider(opts: { signWith?: Uint8Array; fail?: Record<string, unknown> } = {}) {
  const calls: string[] = [];
  const signKey = opts.signWith ?? PRIV;
  const provider = {
    async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
      calls.push(method);
      const failure = opts.fail?.[method];
      if (failure) throw failure;
      switch (method) {
        case 'eth_requestAccounts':
          return [ADDRESS];
        case 'personal_sign': {
          const hex = (params![0] as string).replace(/^0x/, '');
          const message = new TextDecoder().decode(hexToBytes(hex));
          return personalSign(message, signKey);
        }
        case 'eth_signTypedData_v4':
          return '0x' + '11'.repeat(65);
        default:
          throw new Error(`mock provider: unsupported method ${method}`);
      }
    },
  };
  return { provider, calls };
}

/** A mock InfrixClient capturing the eip712 requests it receives. */
function mockClient() {
  const captured: { prepare?: unknown; submit?: unknown } = {};
  const client = {
    restBase: 'http://node.test',
    eip712: {
      async prepare(req: unknown) {
        captured.prepare = req;
        return { typedData: { domain: { name: 'Accumulate' }, message: {} }, transactionHash: '0xtx', chainId: '1' };
      },
      async submit(req: unknown) {
        captured.submit = req;
        return { actor: 'acc://alice.acme', ethAddress: ADDRESS, result: { intentId: 'int-1', planId: 'plan-1', status: 'submitted' } };
      },
    },
    intents: {
      async get() {
        return { status: 'completed', planId: 'plan-1', outcomeId: 'out-1' };
      },
      async outcome() {
        return {
          id: 'out-1',
          totalGasUsed: 7,
          evidenceBundleId: 'ev-1',
          anchorId: 'anc-1',
          finality: 'l0_anchored_final',
          overallStatus: 'completed',
          stepOutcomes: [],
        };
      },
    },
    evidence: {
      async get() {
        return { id: 'ev-1' };
      },
      async exportPortable() {
        return { version: '4', portable: true };
      },
    },
  } as unknown as InfrixClient;
  return { client, captured };
}

const GOAL = {
  signer: 'acc://alice.acme/book/1',
  signerVersion: 12,
  goal: { type: 'CONTRACT_CALL', customParams: { contract: 'acc://alice.acme/counter', function: 'increment', args: '[]' } },
};

test('end-to-end: connect -> recover -> prepare -> sign -> submit -> wait -> export proof', async () => {
  const { provider, calls } = mockProvider();
  const { client, captured } = mockClient();
  const wallet = withMetaMask(client);

  const result = await wallet.metamask.submitIntent({ ...GOAL, provider, requireL0KeyPage: true, wait: true, proof: 'export' });

  // Spine artifacts fully populated.
  assert.equal(result.intentId, 'int-1');
  assert.equal(result.planId, 'plan-1');
  assert.equal(result.outcomeId, 'out-1');
  assert.equal(result.evidenceId, 'ev-1');
  assert.equal(result.anchorId, 'anc-1');
  assert.equal(result.status, 'completed');
  assert.equal(result.finality, 'l0_anchored_final');
  assert.equal(result.l0KeyPageVerified, true);
  assert.equal(result.actor, 'acc://alice.acme');
  assert.equal(result.ethAddress.toLowerCase(), ADDRESS.toLowerCase());
  assert.deepEqual(result.proof, { version: '4', portable: true });

  // The RECOVERED public key was embedded (no manual publicKey input).
  assert.equal(result.publicKey.toLowerCase(), PUB_COMPRESSED);
  assert.equal((captured.submit as { publicKey: string }).publicKey.toLowerCase(), PUB_COMPRESSED);
  assert.equal((captured.prepare as { signer: string }).signer, GOAL.signer);

  // Provider call ORDER, and NO raw-mutation methods.
  assert.deepEqual(
    calls.filter((c) => c.startsWith('eth_') || c === 'personal_sign'),
    ['eth_requestAccounts', 'personal_sign', 'eth_signTypedData_v4'],
  );
  for (const banned of ['eth_sendTransaction', 'eth_sign', 'eth_sendRawTransaction']) {
    assert.ok(!calls.includes(banned), `must not call ${banned}`);
  }
  void provider;
});

test('fails closed when the address does not match the recovered key', async () => {
  // Provider signs with a DIFFERENT key -> recovered address != the account.
  const other = hexToBytes('1111111111111111111111111111111111111111111111111111111111111111');
  const { client } = mockClient();
  const wallet = withMetaMask(client);
  (globalThis as { ethereum?: unknown }).ethereum = mockProvider({ signWith: other }).provider;
  try {
    await assert.rejects(() => wallet.metamask.submitIntent(GOAL), MetaMaskAddressMismatch);
  } finally {
    delete (globalThis as { ethereum?: unknown }).ethereum;
  }
});

test('maps a user rejection (code 4001) to MetaMaskUserRejected', async () => {
  const { client } = mockClient();
  const wallet = withMetaMask(client);
  // Inject the global provider so address-less connect path is exercised.
  (globalThis as { ethereum?: unknown }).ethereum = mockProvider({ fail: { personal_sign: { code: 4001 } } }).provider;
  try {
    await assert.rejects(() => wallet.metamask.submitIntent(GOAL), MetaMaskUserRejected);
  } finally {
    delete (globalThis as { ethereum?: unknown }).ethereum;
  }
});

test('fails closed when the provider lacks eth_signTypedData_v4', async () => {
  const { client } = mockClient();
  const wallet = withMetaMask(client);
  (globalThis as { ethereum?: unknown }).ethereum = mockProvider({
    fail: { eth_signTypedData_v4: new Error('method eth_signTypedData_v4 not supported') },
  }).provider;
  try {
    await assert.rejects(() => wallet.metamask.submitIntent(GOAL));
  } finally {
    delete (globalThis as { ethereum?: unknown }).ethereum;
  }
});

test('recoverPublicKey returns the compressed key + checksummed address', async () => {
  const { client } = mockClient();
  const wallet = withMetaMask(client);
  (globalThis as { ethereum?: unknown }).ethereum = mockProvider().provider;
  try {
    const rec = await wallet.metamask.recoverPublicKey({ signer: GOAL.signer });
    assert.equal(rec.compressed.toLowerCase(), PUB_COMPRESSED);
    assert.equal(rec.address.toLowerCase(), ADDRESS.toLowerCase());
    assert.notEqual(rec.address, rec.address.toLowerCase()); // EIP-55 checksum
  } finally {
    delete (globalThis as { ethereum?: unknown }).ethereum;
  }
});
