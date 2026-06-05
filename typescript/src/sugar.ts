/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InfrixClient } from './index';
import type {
  IntentGoal,
  IntentGoalType,
  GoverningObject,
  CapabilityGrant,
  RoleBinding,
  SettlementInstruction,
  Escrow,
  DisclosureGrant,
  OutcomeRecord,
  OutcomeFinality,
} from './types/governance';

declare function setTimeout(cb: (...args: any[]) => void, ms: number): any;

/**
 * High-level operation result combining intent lifecycle artifacts.
 *
 * The convenience verbs return this after submitting a governed intent
 * and (optionally) waiting for it to reach a terminal state — hiding the
 * Intent → Plan → Approval → Execution → Outcome → Evidence → Anchor
 * spine behind one call while still surfacing every spine artifact for
 * inspection.
 */
export interface GovernedResult<T = unknown> {
  intentId: string;
  planId: string;
  outcomeId: string;
  /** Terminal intent status: 'completed' | 'failed' | 'cancelled' | 'timeout' (when not waited, the submit status). */
  status: string;
  gasUsed: number;
  result?: T;
  /** Evidence bundle id, resolved from the outcome once execution completes. */
  evidenceId?: string;
  /** L0 anchor record id, when the outcome has been anchored. */
  anchorId?: string;
  /** Outcome finality state (provisional … l0_anchored_final). */
  finality?: OutcomeFinality;
  /** Populated on a failed/compensated outcome — the first failing step's error. */
  failureReason?: string;
  /** The full outcome record, when execution has completed. */
  outcome?: OutcomeRecord;
}

/** Options shared by the high-level governed verbs. */
export interface GovernedOptions {
  /** Wait for the intent to reach a terminal state (default: true). */
  wait?: boolean;
  /** Maximum time to wait when waiting (default: 30000ms). */
  maxWaitMs?: number;
  /** Poll interval when waiting (default: 500ms). */
  pollIntervalMs?: number;
  /** Throw InfrixGovernanceError on a failed/cancelled/timeout terminal state (default: false). */
  throwOnFailure?: boolean;
}

/**
 * Error thrown by the high-level verbs when an intent reaches a
 * non-success terminal state and `throwOnFailure` is set.
 */
export class InfrixGovernanceError extends Error {
  readonly intentId: string;
  readonly status: string;
  readonly result: GovernedResult;
  constructor(message: string, result: GovernedResult) {
    super(message);
    this.name = 'InfrixGovernanceError';
    this.intentId = result.intentId;
    this.status = result.status;
    this.result = result;
  }
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
     * Submit any governed goal and (by default) wait for it to reach a
     * terminal state, returning a unified GovernedResult with the
     * outcome, evidence, and anchor wired in. This is the generic
     * primitive the typed verbs below build on.
     *
     * Actor / purpose are taken from the client's disclosure context
     * (`client.setDisclosureContext(...)`), which the RPC layer injects
     * into every submission — set it once before calling.
     *
     * @example
     * ```typescript
     * client.setDisclosureContext({ actor: 'acc://alice.acme', purpose: 'operational' });
     * const r = await governed.submitAndWait(
     *   { type: 'CONTRACT_CALL', customParams: { contract, function: 'increment', args: '[]' } },
     *   { throwOnFailure: true },
     * );
     * ```
     */
    async submitAndWait<T = unknown>(
      goal: IntentGoal,
      opts?: GovernedOptions
    ): Promise<GovernedResult<T>> {
      const submitted = await client.intents.submit(goal);
      if (opts?.wait === false) {
        return {
          intentId: submitted.intentId,
          planId: submitted.planId ?? '',
          outcomeId: submitted.outcomeId ?? '',
          status: submitted.status,
          gasUsed: submitted.gasUsed ?? 0,
        } as GovernedResult<T>;
      }
      return waitForCompletion(client, submitted.intentId, opts) as Promise<GovernedResult<T>>;
    },

    /**
     * Deploy a WASM contract through the governed spine. Hides the
     * canonical CONTRACT_DEPLOY wire shape
     * (`customParams: { authority, bytecode }`, bytecode hex-encoded).
     *
     * @param authority - The deploying ADI URL that will own the contract.
     * @param wasm - Contract bytecode as a Uint8Array, or a hex string.
     * @param opts - Wait/timeout options.
     *
     * @example
     * ```typescript
     * const bytes = await readFile('counter.wasm');
     * const r = await governed.deployContract('acc://alice.acme/counter', bytes,
     *   { throwOnFailure: true });
     * console.log('deployed, anchored:', r.finality, r.anchorId);
     * ```
     */
    async deployContract(
      authority: string,
      wasm: Uint8Array | string,
      opts?: GovernedOptions
    ): Promise<GovernedResult> {
      const goal: IntentGoal = {
        type: 'CONTRACT_DEPLOY' as IntentGoalType,
        customParams: { authority, bytecode: toHex(wasm) },
      };
      return this.submitAndWait(goal, opts);
    },

    /**
     * Call a contract function through the governed spine. Hides the
     * canonical CONTRACT_CALL wire shape
     * (`customParams: { contract, function, args }`, args a JSON array string).
     *
     * @param contractUrl - The contract account URL.
     * @param fn - The function name to call.
     * @param args - Positional arguments (JSON-encoded onto the wire).
     * @param opts - Wait/timeout options.
     */
    async callContract(
      contractUrl: string,
      fn: string,
      args: unknown[] = [],
      opts?: GovernedOptions
    ): Promise<GovernedResult> {
      const goal: IntentGoal = {
        type: 'CONTRACT_CALL' as IntentGoalType,
        customParams: { contract: contractUrl, function: fn, args: JSON.stringify(args) },
      };
      return this.submitAndWait(goal, opts);
    },

    /**
     * Upgrade an existing contract through the governed spine. Hides the
     * canonical CONTRACT_UPGRADE wire shape
     * (`customParams: { contract, newCode }`, newCode hex-encoded).
     *
     * @param contractUrl - The contract account URL being upgraded.
     * @param newWasm - The replacement bytecode as a Uint8Array, or a hex string.
     * @param opts - Wait/timeout options.
     */
    async upgradeContract(
      contractUrl: string,
      newWasm: Uint8Array | string,
      opts?: GovernedOptions
    ): Promise<GovernedResult> {
      const goal: IntentGoal = {
        type: 'CONTRACT_UPGRADE' as IntentGoalType,
        customParams: { contract: contractUrl, newCode: toHex(newWasm) },
      };
      return this.submitAndWait(goal, opts);
    },

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
 * Wait for an intent to reach a terminal state, returning a unified
 * GovernedResult with the outcome, evidence, anchor, and finality wired
 * in. This is the high-level "submit then wait" the convenience verbs
 * use, and is exported so callers who submit manually can reuse it.
 *
 * On a non-success terminal state (failed / cancelled / timeout), when
 * `throwOnFailure` is set, an InfrixGovernanceError is thrown carrying
 * the GovernedResult; otherwise the result is returned with its status
 * and (for failures) failureReason populated.
 *
 * @param client - InfrixClient instance
 * @param intentId - The intent to wait on
 * @param opts - Wait/timeout/throw options
 */
export async function waitForCompletion(
  client: InfrixClient,
  intentId: string,
  opts?: GovernedOptions
): Promise<GovernedResult> {
  const maxWaitMs = opts?.maxWaitMs ?? 30000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 500;
  const deadline = Date.now() + maxWaitMs;

  for (;;) {
    const intent = await client.intents.get(intentId);

    if (
      intent.status === 'completed' ||
      intent.status === 'failed' ||
      intent.status === 'cancelled'
    ) {
      const result: GovernedResult = {
        intentId,
        planId: intent.planId ?? '',
        outcomeId: intent.outcomeId ?? '',
        status: intent.status,
        gasUsed: 0,
      };

      if (intent.outcomeId) {
        try {
          const outcome = await client.intents.outcome(intentId);
          result.outcome = outcome;
          result.gasUsed = outcome.totalGasUsed;
          result.outcomeId = outcome.id || result.outcomeId;
          result.evidenceId = outcome.evidenceBundleId;
          result.anchorId = outcome.anchorId;
          result.finality = outcome.finality;
          if (outcome.overallStatus !== 'completed') {
            const failed = outcome.stepOutcomes?.find((s) => s.status === 'failed');
            result.failureReason = failed?.error ?? `outcome ${outcome.overallStatus}`;
          }
        } catch {
          // Outcome may not be queryable yet; return what we have.
        }
      }

      if (intent.status !== 'completed' && opts?.throwOnFailure) {
        throw new InfrixGovernanceError(
          `intent ${intentId} ended ${intent.status}${result.failureReason ? `: ${result.failureReason}` : ''}`,
          result
        );
      }
      return result;
    }

    if (Date.now() >= deadline) {
      const timeout: GovernedResult = {
        intentId,
        planId: intent.planId ?? '',
        outcomeId: intent.outcomeId ?? '',
        status: 'timeout',
        gasUsed: 0,
        failureReason: `did not reach a terminal state within ${maxWaitMs}ms`,
      };
      if (opts?.throwOnFailure) {
        throw new InfrixGovernanceError(`intent ${intentId} timed out`, timeout);
      }
      return timeout;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

/**
 * Backward-compatible alias retained for callers of the original
 * internal poller. Prefer {@link waitForCompletion}.
 */
async function pollForCompletion(
  client: InfrixClient,
  intentId: string,
  maxWaitMs = 30000,
  pollIntervalMs = 500
): Promise<GovernedResult> {
  return waitForCompletion(client, intentId, { maxWaitMs, pollIntervalMs });
}

/**
 * Hex-encode contract bytecode for the canonical deploy/upgrade wire
 * shape. Accepts a Uint8Array or an already-hex string (passed through
 * after a light validation). Browser- and Node-safe (no Buffer).
 */
function toHex(wasm: Uint8Array | string): string {
  if (typeof wasm === 'string') {
    const s = wasm.startsWith('0x') ? wasm.slice(2) : wasm;
    if (s.length % 2 !== 0 || /[^0-9a-fA-F]/.test(s)) {
      throw new Error('deploy bytecode string must be valid hex');
    }
    return s.toLowerCase();
  }
  let out = '';
  for (let i = 0; i < wasm.length; i++) {
    out += wasm[i].toString(16).padStart(2, '0');
  }
  return out;
}
