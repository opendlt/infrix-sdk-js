/**
 * High-level developer flows (platform-review-3 Epic 7).
 *
 * Each `with*` helper augments an InfrixClient with a focused, day-one
 * facade so a new developer reaches a working governed app without first
 * learning the spine:
 *
 *   withGoldenApp     — escrow create/release/export (see ./golden/escrow)
 *   withProofs        — export + verify proofs locally
 *   withReadiness     — query the substrate readiness dashboard
 *   withWitnesses     — evaluate independent witness receipts on a proof
 *   withHostedDevnet  — point a client at a hosted devnet + L0 endpoint
 */
import type { InfrixClient } from './index';
import { verifyLocalProof, hasReplayCapsule } from './proofs/verifyLocal';
import type { PortableProof, VerifyRequire, ProofVerifyResult } from './proofs/verifyLocal';

/**
 * withProofs adds proof export + local verification. The export refuses to
 * emit a public-production proof that lacks a replay capsule — the SDK
 * mirrors the node's fail-closed export gate.
 */
export function withProofs(client: InfrixClient) {
  return {
    ...client,
    proofs: {
      /** Export a portable proof for an intent's evidence bundle. */
      async export(params: { intentId: string; profile?: string }): Promise<PortableProof> {
        const bundle = (await client.evidence.get(params.intentId)) as unknown as Record<string, unknown>;
        const evidenceId = (bundle.id ?? bundle.bundleId) as string | undefined;
        if (!evidenceId) {
          throw new Error('withProofs: evidence bundle has no id to export');
        }
        const pkg = await client.evidence.exportPortable(evidenceId);
        if (params.profile === 'public_production' && !hasReplayCapsule(pkg)) {
          throw new Error(
            'withProofs: refusing to export a public_production proof without a replay capsule (deterministic replay material missing)'
          );
        }
        return pkg;
      },

      /**
       * Verify a portable proof locally (offline, structural). Use
       * `infrix verify` for full cryptographic + live-L0 verification.
       */
      verifyLocal(pkg: PortableProof, opts: VerifyRequire = {}): ProofVerifyResult {
        return verifyLocalProof(pkg, opts);
      },
    },
  };
}

/** A substrate readiness row, as returned by /v4/readiness/substrates. */
export interface SubstrateRow {
  category: string;
  name: string;
  status: string;
  detail?: string;
}

/** The readiness report shape. */
export interface ReadinessReport {
  substrates: SubstrateRow[];
  profile?: string;
  profileMet?: boolean;
}

type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * withReadiness queries the node's substrate readiness dashboard. baseUrl is
 * the node's v4 API base (e.g. http://localhost:8080); fetchImpl defaults to
 * the global fetch (injectable for tests).
 */
export function withReadiness(baseUrl: string, fetchImpl?: FetchLike) {
  const doFetch: FetchLike = fetchImpl ?? ((url: string) => (globalThis as unknown as { fetch: FetchLike }).fetch(url));
  const base = baseUrl.replace(/\/+$/, '');
  return {
    readiness: {
      /** Fetch the readiness report, optionally evaluated against a profile. */
      async fetch(profile?: string): Promise<ReadinessReport> {
        const q = profile ? `?profile=${encodeURIComponent(profile)}` : '';
        const res = await doFetch(`${base}/v4/readiness/substrates${q}`);
        if (!res.ok) throw new Error(`withReadiness: readiness request failed`);
        const body = (await res.json()) as { data?: ReadinessReport } & ReadinessReport;
        return body.data ?? body;
      },
      /** True iff the node meets the given profile. */
      async meets(profile: string): Promise<boolean> {
        const r = await this.fetch(profile);
        return r.profileMet === true;
      },
    },
  };
}

/** One witness receipt attached to a proof. */
export interface WitnessReceipt {
  witnessIdentity?: string;
  replayResult?: string;
  [k: string]: unknown;
}

/** Result of evaluating witness receipts on a proof. */
export interface WitnessEvaluation {
  count: number;
  identities: string[];
  thresholdMet: (min: number) => boolean;
}

/**
 * withWitnesses evaluates the independent witness receipts attached to a
 * proof: it counts DISTINCT witnesses that reproduced the outcome. Full
 * cross-binding + signature verification is performed by `infrix verify
 * --require-witness-threshold`; this is the day-one convenience view.
 */
export function withWitnesses(client: InfrixClient) {
  return {
    ...client,
    witnesses: {
      evaluate(pkg: PortableProof): WitnessEvaluation {
        const raw = (pkg.witnessReceipts as WitnessReceipt[] | undefined) ?? [];
        const seen = new Set<string>();
        for (const r of raw) {
          if (r.replayResult === 'reproduced' && r.witnessIdentity) {
            seen.add(r.witnessIdentity);
          }
        }
        const identities = [...seen].sort();
        return {
          count: identities.length,
          identities,
          thresholdMet: (min: number) => identities.length >= min,
        };
      },
    },
  };
}

/** Hosted-devnet connection metadata. */
export interface HostedDevnet {
  endpoint: string;
  l0: string;
  faucetHint: string;
}

/**
 * withHostedDevnet augments a client with hosted-devnet metadata: the v4
 * endpoint and the Accumulate L0 network the demo anchors to, plus a faucet
 * hint. The happy-path hosted demo reaches L4/G2 against this L0.
 */
export function withHostedDevnet(client: InfrixClient, opts: { endpoint?: string; l0?: string } = {}) {
  const l0 = opts.l0 ?? 'kermit';
  return {
    ...client,
    hostedDevnet: {
      endpoint: opts.endpoint ?? 'http://localhost:8545',
      l0,
      faucetHint: `infrix faucet acc://<lite-token-account> --endpoint ${l0}`,
    } as HostedDevnet,
  };
}
