import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ApprovalSigningRequest,
  settlementApprovalPreimage,
  approvalSigningDigest,
  approvalSigningPreimage,
  bindApprovalSigningRequest,
} from './approval-signing';
import { sha256, toHex } from './crypto';

// THE APPROVAL PREIMAGE IS PINNED TO A SHARED VALUE, NOT A SHARED ROUND TRIP.
//
// Session 37 (S24). The canonical approval preimage is implemented twice on
// purpose: in infrix-core (pkg/workflow/approval_preimage.go — the node
// publishes and the approval store verifies over it) and here, so the wallet
// derives the digest itself instead of signing one a node hands it. Both sides
// pin the SAME bytes: VECTOR_HEX / VECTOR_DIGEST are duplicated verbatim in
// infrix-core pkg/workflow/s24_approval_preimage_vector_test.go. Change the
// encoding on either side and both go red.

const VECTOR_HEX =
  '0000001c696e667269782f617070726f76616c2d7369676e61747572652f7632000000066b65726d697400000019696e74656e742d6163633a2f2f616c6963652e61636d652d3100000026696e74656e742d6163633a2f2f616c6963652e61636d652d312d676170342d617070726f7665000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1ffffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e00000000767686f73742d31000000186163633a2f2f616c6963652e61636d652f636f756e7465720000000000000003000000076465706f73697400000008776974686472617700000007c3bc6d6c61757400000000000f4240000000000003d09000000000000000020000000441434d450000000455534443000000000000000a00000000000000140000000b62616c616e6365203e20300000000000000063000000106163633a2f2f616c6963652e61636d650000000561646d696e000000176163633a2f2f616c6963652e61636d652f626f6f6b2f3100000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f';
const VECTOR_DIGEST = '7c365580a76659676298c656cac72e0acc8a8e129dfe395699ee4c8f110352fa';

// The same input as s24ApprovalPreimageVectorInput, in the JSON shape the node
// publishes ([32]byte as arrays, []byte as base64).
function vectorInput(): ApprovalSigningRequest {
  const planHash = Array.from({ length: 32 }, (_, i) => i);
  const simulationHash = Array.from({ length: 32 }, (_, i) => 0xff - i);
  const pub = Uint8Array.from({ length: 32 }, (_, i) => 0x40 + i);
  return {
    networkId: 'kermit',
    workflowId: 'intent-acc://alice.acme-1',
    stageId: 'intent-acc://alice.acme-1-gap4-approve',
    planHash,
    simulationHash,
    ghostReceiptId: 'ghost-1',
    scope: {
      contractUrl: 'acc://alice.acme/counter',
      functions: ['withdraw', 'deposit', 'ümlaut'],
      maxAmount: 1_000_000,
      maxGas: 250_000,
      targetAssets: ['USDC', 'ACME'],
    },
    conditions: { minBlockHeight: 10, maxBlockHeight: 20, requiredState: 'balance > 0' },
    expiresAtBlock: 99,
    signerIdentity: 'acc://alice.acme',
    signerRole: 'admin',
    keyPageRef: 'acc://alice.acme/book/1',
    signerPublicKey: btoa(String.fromCharCode(...pub)),
    digest: '',
  };
}

test('the approval preimage matches the vector infrix-core is pinned to', async () => {
  assert.equal(toHex(approvalSigningPreimage(vectorInput())), VECTOR_HEX);
  assert.equal(await approvalSigningDigest(vectorInput()), VECTOR_DIGEST);
});

test('binding refuses material whose published digest does not derive from its fields', async () => {
  const req = vectorInput();
  req.signerPublicKey = undefined;
  req.digest = await approvalSigningDigest(req);
  const pub = Uint8Array.from({ length: 32 }, (_, i) => 0x40 + i);
  const { bound, preimage } = await bindApprovalSigningRequest(req, pub);
  assert.equal(toHex(preimage), VECTOR_HEX);
  assert.equal(bound.digest, VECTOR_DIGEST);

  const tampered = { ...req, stageId: 'some-other-stage' };
  await assert.rejects(() => bindApprovalSigningRequest(tampered, pub), /refusing to sign/);
});

// The settlement-approval preimage — duplicated verbatim in infrix-core
// pkg/workflow/s24_settlement_approval_preimage_vector_test.go.
const SETTLEMENT_VECTOR_HEX =
  '00000027696e667269782f736574746c656d656e742d617070726f76616c2d7369676e61747572652f7631000000066b65726d69740000000d736574746c656d656e742d3432000000106163633a2f2f616c6963652e61636d65000000087472656173757279000000176163633a2f2f616c6963652e61636d652f626f6f6b2f3100000020404142434445464748494a4b4c4d4e4f505152535455565758595a5b5c5d5e5f';
const SETTLEMENT_VECTOR_DIGEST = '33838d88b64e5005203739da7969c6585966b28a21bce36b0efa9b767932e0cb';

test('the settlement-approval preimage matches the vector infrix-core is pinned to', async () => {
  const pre = settlementApprovalPreimage({
    networkId: 'kermit',
    settlementId: 'settlement-42',
    signerIdentity: 'acc://alice.acme',
    signerRole: 'treasury',
    keyPageRef: 'acc://alice.acme/book/1',
    signerPublicKey: Uint8Array.from({ length: 32 }, (_, i) => 0x40 + i),
  });
  assert.equal(toHex(pre), SETTLEMENT_VECTOR_HEX);
  assert.equal(toHex(await sha256(pre)), SETTLEMENT_VECTOR_DIGEST);
});

test('a settlement approval on another network is a different statement', () => {
  const base = {
    settlementId: 'settlement-42',
    signerIdentity: 'acc://alice.acme',
    keyPageRef: 'acc://alice.acme/book/1',
    signerPublicKey: new Uint8Array(32),
  };
  assert.notEqual(
    toHex(settlementApprovalPreimage({ ...base, networkId: 'kermit' })),
    toHex(settlementApprovalPreimage({ ...base, networkId: 'mainnet' }))
  );
});
