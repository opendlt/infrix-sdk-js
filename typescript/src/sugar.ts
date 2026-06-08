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
} from './types/governance';
import {
  normalizeSubmittedIntent,
  waitForGovernedResult,
  InfrixGovernanceError,
} from './results';
import type { GovernedResult, ResultCompletenessOptions, SubmittedLike } from './results';

// Re-export the canonical result types from the shared normalizer so existing
// imports (`import { GovernedResult } from '@infrix/client'`) keep working —
// there is now ONE definition of a governed result, in ./results.
export type { GovernedResult } from './results';
export { InfrixGovernanceError } from './results';

/**
 * Options shared by the high-level governed verbs. This is the shared
 * completeness/await control surface — `wait`, timeouts, throwOnFailure, the
 * `require*` completeness assertions, and proof export. (Alias retained for
 * back-compat; it is exactly {@link ResultCompletenessOptions}.)
 */
export type GovernedOptions = ResultCompletenessOptions;

/**
 * Mixin that adds convenience wrappers to InfrixClient.
 *
 * Every helper submits through the canonical governance spine and returns a
 * fully-hydrated {@link GovernedResult} via the shared normalizer — never a
 * blank id, fake gas, or partial state presented as complete. The supported
 * goal types come from the `IntentGoalType` union in `./types/governance`.
 *
 * @example
 * ```typescript
 * const governed = withGovernanceSugar(client);
 * const r = await governed.singleLegSettlement(
 *   'acc://alice.acme/tokens', 'acc://bob.acme/tokens', 100,
 * );
 * console.log(r.intentId, r.planId, r.outcomeId, r.evidenceId, r.anchorId, r.gasAvailable && r.gasUsed);
 * ```
 */
export function withGovernanceSugar(client: InfrixClient) {
  const normalize = <T = unknown>(s: SubmittedLike, opts?: GovernedOptions) =>
    normalizeSubmittedIntent<T>(client, s, opts);

  return {
    ...client,

    /**
     * Submit any governed goal and (by default) wait for it to reach a terminal
     * state, returning a fully-hydrated GovernedResult with the outcome,
     * evidence, anchor, finality, gas, and (optionally) proof wired in.
     */
    async submitAndWait<T = unknown>(goal: IntentGoal, opts?: GovernedOptions): Promise<GovernedResult<T>> {
      const submitted = await client.intents.submit(goal);
      return normalize<T>(submitted as unknown as SubmittedLike, opts);
    },

    /**
     * Deploy a WASM contract through the governed spine (canonical
     * CONTRACT_DEPLOY: `customParams: { authority, bytecode }`, hex bytecode).
     */
    async deployContract(
      authority: string,
      wasm: Uint8Array | string,
      opts?: GovernedOptions,
    ): Promise<GovernedResult> {
      const goal: IntentGoal = {
        type: 'CONTRACT_DEPLOY' as IntentGoalType,
        customParams: { authority, bytecode: toHex(wasm) },
      };
      return this.submitAndWait(goal, opts);
    },

    /**
     * Call a contract function through the governed spine (canonical
     * CONTRACT_CALL: `customParams: { contract, function, args }`).
     */
    async callContract(
      contractUrl: string,
      fn: string,
      args: unknown[] = [],
      opts?: GovernedOptions,
    ): Promise<GovernedResult> {
      const goal: IntentGoal = {
        type: 'CONTRACT_CALL' as IntentGoalType,
        customParams: { contract: contractUrl, function: fn, args: JSON.stringify(args) },
      };
      return this.submitAndWait(goal, opts);
    },

    /**
     * Upgrade an existing contract through the governed spine (canonical
     * CONTRACT_UPGRADE: `customParams: { contract, newCode }`).
     */
    async upgradeContract(
      contractUrl: string,
      newWasm: Uint8Array | string,
      opts?: GovernedOptions,
    ): Promise<GovernedResult> {
      const goal: IntentGoal = {
        type: 'CONTRACT_UPGRADE' as IntentGoalType,
        customParams: { contract: contractUrl, newCode: toHex(newWasm) },
      };
      return this.submitAndWait(goal, opts);
    },

    /**
     * Move value between two accounts via the governed settlement pipeline
     * (one-leg SettlementInstruction through the canonical spine).
     */
    async singleLegSettlement(
      from: string,
      to: string,
      amount: number,
      opts?: { asset?: string; trustProfile?: string } & GovernedOptions,
    ): Promise<GovernedResult<SettlementInstruction>> {
      const result = await client.settlements.create({
        legs: [{ legId: 'leg-1', fromAccount: from, toAccount: to, asset: opts?.asset ?? 'ACME', amount, sequence: 0 }],
        trustProfileRefs: opts?.trustProfile ? [opts.trustProfile] : [],
      });
      return normalize<SettlementInstruction>(result as unknown as SubmittedLike, opts);
    },

    /**
     * Create a governed object via the intent pipeline.
     */
    async createObject(
      type: string,
      fields: Record<string, unknown>,
      opts?: GovernedOptions,
    ): Promise<GovernedResult<GoverningObject>> {
      const goal: IntentGoal = {
        type: 'OBJECT_CREATE',
        targetState: {
          stateType: type,
          parameters: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)])),
        },
      };
      const result = await client.intents.submit(goal);
      return normalize<GoverningObject>(result as unknown as SubmittedLike, opts);
    },

    /**
     * Grant a capability via the intent pipeline.
     */
    async grantCapability(
      grantee: string,
      capabilities: string[],
      scope?: { contractUrl?: string; domain?: string },
      opts?: GovernedOptions,
    ): Promise<GovernedResult<CapabilityGrant>> {
      const goal: IntentGoal = {
        type: 'CAPABILITY_GRANT',
        targetState: {
          stateType: 'capability_grant',
          parameters: { grantee, capabilities: capabilities.join(','), scope: JSON.stringify(scope ?? {}) },
        },
      };
      const result = await client.intents.submit(goal);
      return normalize<CapabilityGrant>(result as unknown as SubmittedLike, opts);
    },

    /**
     * Assign a role via the intent pipeline. Routes through the normalizer so
     * the result carries the real plan/outcome/evidence/anchor artifacts, not
     * blank ids.
     */
    async assignRole(
      identity: string,
      role: string,
      scope?: { contractUrl?: string; adi?: string },
      opts?: GovernedOptions,
    ): Promise<GovernedResult<RoleBinding>> {
      const result = await client.roles.assign(identity, role, scope?.contractUrl ?? scope?.adi ?? 'global');
      return normalize<RoleBinding>(result as unknown as SubmittedLike, opts);
    },

    /**
     * Create a settlement via the intent pipeline (fully hydrated result).
     */
    async createSettlement(
      from: string,
      to: string,
      amount: number,
      opts?: { asset?: string; trustProfile?: string } & GovernedOptions,
    ): Promise<GovernedResult<SettlementInstruction>> {
      const result = await client.settlements.create({
        legs: [{ legId: 'leg-1', fromAccount: from, toAccount: to, asset: opts?.asset ?? 'ACME', amount, sequence: 0 }],
        trustProfileRefs: opts?.trustProfile ? [opts.trustProfile] : [],
      });
      return normalize<SettlementInstruction>(result as unknown as SubmittedLike, opts);
    },

    /**
     * Create an escrow via the intent pipeline (fully hydrated result).
     */
    async createEscrow(
      depositor: string,
      beneficiary: string,
      amount: number,
      conditions: Array<{ type: string; params: Record<string, unknown> }>,
      opts?: { asset?: string; disputeWindow?: number; arbiter?: string } & GovernedOptions,
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
      return normalize<Escrow>(result as unknown as SubmittedLike, opts);
    },

    /**
     * Grant disclosure access via the intent pipeline (fully hydrated result).
     */
    async grantDisclosure(
      grantee: string,
      target: string,
      fields: string[],
      opts?: { purpose?: string; expiresAt?: string } & GovernedOptions,
    ): Promise<GovernedResult<DisclosureGrant>> {
      const result = await client.disclosures.grant(grantee, target, fields, opts);
      return normalize<DisclosureGrant>(result as unknown as SubmittedLike, opts);
    },
  };
}

/**
 * Wait for an intent to reach a terminal state, returning a fully-hydrated
 * GovernedResult (outcome, evidence, anchor, finality, gas, failure reason).
 * Delegates to the shared normalizer so the behaviour is identical everywhere.
 *
 * Retained as a named export for callers who submit manually.
 */
export async function waitForCompletion(
  client: InfrixClient,
  intentId: string,
  opts?: GovernedOptions,
): Promise<GovernedResult> {
  return waitForGovernedResult(client, intentId, opts);
}

/**
 * Hex-encode contract bytecode for the canonical deploy/upgrade wire shape.
 * Accepts a Uint8Array or an already-hex string. Browser- and Node-safe.
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
