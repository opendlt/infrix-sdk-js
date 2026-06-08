// Example: connect MetaMask and submit a governed intent.
// Run in a browser bundle (needs window.ethereum). Shown here as the shape.

import { createInfrixMetaMask, MetaMaskErrorCode } from '@infrix/metamask';

const mm = createInfrixMetaMask({ endpoint: 'https://my-infrix-node' });

const status = mm.providerStatus();
if (!status.present) {
  console.error('No MetaMask provider — install or unlock MetaMask.');
} else {
  try {
    await mm.connect();
    const result = await mm.submitGovernedIntent({
      signer: 'acc://alice.acme/book/1',
      signerVersion: 1,
      goal: { type: 'TOKEN_TRANSFER', targetAssets: [{ asset: 'ACME', amount: '5' }] },
    });
    console.log('intent:', result.intentId, 'key-page verified:', result.l0KeyPageVerified);
  } catch (e) {
    if (e.code === MetaMaskErrorCode.UserRejected) console.warn('User cancelled.');
    else console.error(e.code, e.message);
  }
}
