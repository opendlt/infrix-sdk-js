/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InfrixClient } from './index';
import type {
  IntentGoal,
  GoverningObject,
  CapabilityGrant,
  RoleBinding,
  SettlementInstruction,
  Escrow,
  DisclosureGrant,
} from './types/governance';

declare function setTimeout(cb: (...args: any[]) => void, ms: number): any;

/**
 * High-level operation result combining intent lifecycle artifacts.
 */
export interface GovernedResult<T = unknown> {
  intentId: string;
  planId: string;
  outcomeId: string;
  status: string;
  gasUsed: number;
  result?: T;
  evidenceId?: string;
}

/**
 * Mixin that adds convenience wrappers to InfrixClient.
 *
 * These methods submit intents, poll for completion, and return
 * unified GovernedResult objects. Every helper delegates to the
 * canonical governance spine — the supported goal types come from
 * the `IntentGoalType` union in `./types/governance` (line 34-95).
 *
 * @example
 * ```typescript
 * const governed = withGovernanceSugar(client);
 * const result = await governed.singleLegSettlement(
 *   'acc://alice.acme/tokens',
 *   'acc://bob.acme/tokens',
 *   100,
 * );
 * ```
 */
export function withGovernanceSugar(client: InfrixClient) {
  return {
    ...client,

    /**
     * Move value between two accounts via the governed settlement
     * pipeline. The Gap 13 first-pass closure removed the standalone
     * `TRANSFER` goal type; single-leg transfers and escrow creation
     * now route through `SETTLEMENT` with a single Leg (see
     * `sdk/typescript/src/types/governance.ts:28-32`).
     *
     * Internally builds a one-leg SettlementInstruction and routes it
     * through the canonical spine: Intent → Plan → Approval →
     * Execution → Outcome → Evidence → Anchor.
     *
     * @param from - Source account URL
     * @param to - Destination account URL
     * @param amount - Amount to move
     * @param opts - Optional: asset type, trust profile reference
     *
     * @example
     * ```typescript
     * const result = await governed.singleLegSettlement(
     *   'acc://alice.acme/tokens',
     *   'acc://bob.acme/tokens',
     *   100
     * );
     * console.log(`Settlement completed: ${result.intentId}, gas: ${result.gasUsed}`);
     * ```
     */
    async singleLegSettlement(
      from: string,
      to: string,
      amount: number,
      opts?: { asset?: string; trustProfile?: string }
    ): Promise<GovernedResult<SettlementInstruction>> {
      const result = await client.settlements.create({
        legs: [
          {
            legId: 'leg-1',
            fromAccount: from,
            toAccount: to,
            asset: opts?.asset ?? 'ACME',
            amount,
            sequence: 0,
          },
        ],
        trustProfileRefs: opts?.trustProfile ? [opts.trustProfile] : [],
      });

      return pollForCompletion(client, result.intentId) as Promise<GovernedResult<SettlementInstruction>>;
    },

    /**
     * Create a governed object via intent pipeline.
     *
     * @param type - Object type (e.g. 'credential', 'vault', 'workflow')
     * @param fields - Object fields/properties
     * @param opts - Optional: owner, policies
     *
     * @example
     * ```typescript
     * const cred = await governed.createObject('credential', {
     *   holder: 'acc://alice.acme',
     *   claims: { degree: 'PhD', field: 'CS' },
     * });
     * ```
     */
    async createObject(
      type: string,
      fields: Record<string, unknown>,
      opts?: { owner?: string; policies?: string[] }
    ): Promise<GovernedResult<GoverningObject>> {
      const goal: IntentGoal = {
        type: 'OBJECT_CREATE',
        targetState: {
          stateType: type,
          parameters: Object.fromEntries(
            Object.entries(fields).map(([k, v]) => [k, String(v)])
          ),
        },
      };

      const result = await client.intents.submit(goal);
      return pollForCompletion(client, result.intentId) as Promise<GovernedResult<GoverningObject>>;
    },

    /**
     * Grant a capability via intent pipeline.
     *
     * @param grantee - DID or ADI URL of the grantee
     * @param capabilities - Array of capability strings (e.g. ['token:transfer', 'object:create'])
     * @param scope - Optional scope constraint for the grant
     */
    async grantCapability(
      grantee: string,
      capabilities: string[],
      scope?: { contractUrl?: string; domain?: string }
    ): Promise<GovernedResult<CapabilityGrant>> {
      const goal: IntentGoal = {
        type: 'CAPABILITY_GRANT',
        targetState: {
          stateType: 'capability_grant',
          parameters: {
            grantee,
            capabilities: capabilities.join(','),
            scope: JSON.stringify(scope ?? {}),
          },
        },
      };

      const result = await client.intents.submit(goal);
      return pollForCompletion(client, result.intentId) as Promise<GovernedResult<CapabilityGrant>>;
    },

    /**
     * Assign a role via intent pipeline.
     *
     * @param identity - DID or ADI URL of the assignee
     * @param role - Role name (e.g. 'admin', 'treasury_officer', 'auditor')
     * @param scope - Optional scope constraint (contract URL or ADI)
     */
    async assignRole(
      identity: string,
      role: string,
      scope?: { contractUrl?: string; adi?: string }
    ): Promise<GovernedResult<RoleBinding>> {
      const result = await client.roles.assign(
        identity,
        role,
        scope?.contractUrl ?? scope?.adi ?? 'global'
      );
      // Role assignment returns immediately; wrap in GovernedResult
      return {
        intentId: result.intentId,
        planId: '',
        outcomeId: '',
        status: result.status,
        gasUsed: 0,
      };
    },

    /**
     * Create a settlement via intent pipeline.
     *
     * @param from - Source account URL
     * @param to - Destination account URL
     * @param amount - Amount to settle
     * @param opts - Optional: asset type, trust profile reference
     */
    async createSettlement(
      from: string,
      to: string,
      amount: number,
      opts?: { asset?: string; trustProfile?: string }
    ): Promise<GovernedResult<SettlementInstruction>> {
      const result = await client.settlements.create({
        legs: [
          {
            legId: 'leg-1',
            fromAccount: from,
            toAccount: to,
            asset: opts?.asset ?? 'ACME',
            amount,
            sequence: 0,
          },
        ],
        trustProfileRefs: opts?.trustProfile ? [opts.trustProfile] : [],
      });

      return {
        intentId: result.intentId,
        planId: '',
        outcomeId: '',
        status: result.status,
        gasUsed: 0,
      };
    },

    /**
     * Create an escrow via intent pipeline.
     *
     * @param depositor - Depositor account URL
     * @param beneficiary - Beneficiary account URL
     * @param amount - Amount to escrow
     * @param conditions - Release conditions
     * @param opts - Optional: asset type, dispute window, arbiter
     */
    async createEscrow(
      depositor: string,
      beneficiary: string,
      amount: number,
      conditions: Array<{ type: string; params: Record<string, unknown> }>,
      opts?: { asset?: string; disputeWindow?: number; arbiter?: string }
    ): Promise<GovernedResult<Escrow>> {
      const result = await client.escrows.create({
        depositor,
        beneficiary,
        asset: opts?.asset ?? 'ACME',
        amount,
        releaseConditions: conditions.map((c) => ({
          ...c,
          type: c.type as 'approval' | 'time_lock' | 'external_proof' | 'state_check' | 'custom',
          params: c.params,
          satisfied: false,
        })),
        disputeWindow: opts?.disputeWindow,
        arbiter: opts?.arbiter,
      });

      return {
        intentId: result.intentId,
        planId: '',
        outcomeId: '',
        status: result.status,
        gasUsed: 0,
      };
    },

    /**
     * Grant disclosure access via intent pipeline.
     *
     * @param grantee - Identity receiving disclosure access
     * @param target - Object being disclosed (type:id)
     * @param fields - Fields to disclose (empty = all)
     * @param opts - Optional: purpose, expiration
     */
    async grantDisclosure(
      grantee: string,
      target: string,
      fields: string[],
      opts?: { purpose?: string; expiresAt?: string }
    ): Promise<GovernedResult<DisclosureGrant>> {
      const result = await client.disclosures.grant(grantee, target, fields, opts);
      return {
        intentId: result.intentId,
        planId: '',
        outcomeId: '',
        status: result.status,
        gasUsed: 0,
      };
    },
  };
}

/**
 * Poll an intent until it reaches a terminal state.
 * Returns the unified GovernedResult.
 *
 * @param client - InfrixClient instance
 * @param intentId - The intent to poll
 * @param maxWaitMs - Maximum time to wait (default: 30000ms)
 * @param pollIntervalMs - Polling interval (default: 500ms)
 */
async function pollForCompletion(
  client: InfrixClient,
  intentId: string,
  maxWaitMs = 30000,
  pollIntervalMs = 500
): Promise<GovernedResult> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const intent = await client.intents.get(intentId);

    if (
      intent.status === 'completed' ||
      intent.status === 'failed' ||
      intent.status === 'cancelled'
    ) {
      let gasUsed = 0;
      const outcomeId = intent.outcomeId ?? '';

      if (intent.outcomeId) {
        try {
          const outcome = await client.intents.outcome(intentId);
          gasUsed = outcome.totalGasUsed;
        } catch {
          // Outcome may not be available yet
        }
      }

      return {
        intentId,
        planId: intent.planId ?? '',
        outcomeId,
        status: intent.status,
        gasUsed,
        evidenceId: undefined,
      };
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return {
    intentId,
    planId: '',
    outcomeId: '',
    status: 'timeout',
    gasUsed: 0,
  };
}
