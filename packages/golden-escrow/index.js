// @infrix/golden-escrow (adoption-10) — the golden verifiable-escrow flow in one
// import and one call. createAndProve creates the escrow through the governance
// pipeline, exports the portable proof, verifies it offline, and returns the
// escrow id, the governed result, a proof receipt, and the exact command to
// verify it yourself. No fabricated ids, no fake gas, no node trust.

import { verifyProof } from '@infrix/proof-receipt';

/**
 * createEscrowApp builds a one-call escrow app. Provide `{ endpoint }` to talk
 * to a live node (the core `@infrix/client` is loaded lazily as a peer), or
 * inject `{ client }` (a `withGoldenApp`-shaped client) for tests.
 *
 * @param {{ endpoint?: string, client?: any, l0?: string }} [options]
 */
export function createEscrowApp(options = {}) {
  const { endpoint, client, l0 } = options;
  if (!endpoint && !client) {
    throw new TypeError('createEscrowApp: provide { endpoint } (live) or { client } (injected)');
  }

  let appPromise = null;
  async function resolveApp() {
    if (client) return client;
    if (!appPromise) {
      appPromise = (async () => {
        const mod = await import('@infrix/client');
        return mod.withGoldenApp(new mod.InfrixClient(endpoint));
      })();
    }
    return appPromise;
  }

  return {
    /**
     * createAndProve runs the whole golden flow and proves it.
     * @param {{ buyer: string, seller: string, amount: number, asset?: string }} params
     */
    async createAndProve(params = {}) {
      const { buyer, seller, amount, asset } = params;
      if (!buyer || !seller) throw new TypeError('createAndProve: buyer and seller are required');
      if (!(typeof amount === 'number' && amount > 0)) {
        throw new TypeError('createAndProve: amount must be a number > 0');
      }

      const app = await resolveApp();
      const handle = await app.escrow.create({ buyer, seller, amount, asset });
      if (!handle || !handle.intentId) {
        throw new Error('createAndProve: escrow.create returned no intentId; cannot prove an incomplete result');
      }
      const proof = await app.proofs.export({ intentId: handle.intentId });
      const receipt = await verifyProof(proof, l0 ? { l0 } : {});

      return {
        escrowId: handle.escrowId,
        governedResult: handle,
        proof,
        proofReceipt: receipt,
        verifyCommand: receipt.verification.command,
      };
    },
  };
}
