/**
 * Golden app — Verifiable Escrow With Regulated Release
 * (platform-review-2 Epic D).
 *
 * The adoption wedge: one workflow that proves why Infrix matters without
 * forcing a new developer to learn the spine first. The day-one API speaks
 * escrow, not Intent/Plan/Approval/Outcome/Evidence/Anchor — yet under the
 * hood every call still flows through the canonical governance spine.
 *
 * @example
 * ```ts
 * const app = withGoldenApp(new InfrixClient('http://localhost:8080'));
 * const { escrowId, intentId } = await app.escrow.create({ buyer, seller, amount });
 * await app.escrow.release({ escrowId });
 * const proof = await app.proofs.export({ intentId });
 * // hand `proof` to anyone: `infrix verify proof.json` proves the whole flow.
 * ```
 */
import type { InfrixClient } from '../index';
import { normalizeSubmittedIntent } from '../results';
import type { GovernedResult, ResultCompletenessOptions, SubmittedLike } from '../results';

/** Parameters to open a governed escrow. No spine vocabulary required. */
export interface EscrowCreateParams {
  buyer: string;
  seller: string;
  amount: number;
  /** Asset symbol (default "USDC"). */
  asset?: string;
}

/**
 * A handle to an opened escrow. It carries the escrow id AND the full set of
 * real spine artifacts (intent/plan/outcome/evidence/anchor/finality/gas) — the
 * day-one flow never requires the caller to reason about them, but they are not
 * faked or blanked: every field is the real hydrated value.
 */
export interface EscrowHandle extends GovernedResult {
  escrowId: string;
}

/** Parameters to release a governed escrow. */
export interface EscrowReleaseParams {
  escrowId: string;
  /** Optional approver identity for the regulated release. */
  identity?: string;
}

/** A portable, independently-verifiable proof package. */
export type PortableProof = Record<string, unknown>;

/**
 * Augments an InfrixClient with the golden-app facade: `escrow` (create /
 * release) and `proofs` (export). Every method delegates to the canonical
 * spine sub-clients — the spine is hidden, not bypassed.
 */
export function withGoldenApp(client: InfrixClient) {
  return {
    ...client,

    escrow: {
      /**
       * Open an escrow: the buyer deposits for the seller under a policy
       * that requires a regulated release (role approval or credential).
       * Routes through the governed settlement/escrow spine.
       */
      async create(params: EscrowCreateParams, opts?: ResultCompletenessOptions): Promise<EscrowHandle> {
        const r = await client.escrows.create({
          depositor: params.buyer,
          beneficiary: params.seller,
          asset: params.asset ?? 'USDC',
          amount: params.amount,
          releaseConditions: [
            { type: 'approval', params: {}, satisfied: false },
          ],
        });
        // Golden-app default: hydrate the real outcome (no blank/partial state).
        const governed = await normalizeSubmittedIntent(client, r as unknown as SubmittedLike, {
          requireOutcome: true,
          throwOnIncomplete: true,
          ...opts,
        });
        return { ...governed, escrowId: r.escrowId };
      },

      /**
       * Release a held escrow to the seller. The regulated-release policy
       * is enforced by the spine; the caller only says "release". Returns the
       * fully-hydrated governed result for the release intent.
       */
      async release(
        params: EscrowReleaseParams,
        opts?: ResultCompletenessOptions,
      ): Promise<GovernedResult> {
        const r = await client.escrows.release(
          params.escrowId,
          params.identity ? { identity: params.identity } : undefined,
        );
        return normalizeSubmittedIntent(client, r as unknown as SubmittedLike, { requireOutcome: true, ...opts });
      },
    },

    proofs: {
      /**
       * Export a portable, independently-verifiable proof of the flow.
       * Hand the result to anyone: `infrix verify` (or
       * pkg/evidence.VerifyPortablePackage) proves it offline with no trust
       * in this node.
       */
      async export(params: { intentId: string }): Promise<PortableProof> {
        const bundle = await client.evidence.get(params.intentId);
        const evidenceId =
          (bundle as unknown as { id?: string; bundleId?: string }).id ??
          (bundle as unknown as { id?: string; bundleId?: string }).bundleId;
        if (!evidenceId) {
          throw new Error('golden-escrow: evidence bundle has no id to export');
        }
        return client.evidence.exportPortable(evidenceId);
      },
    },
  };
}
