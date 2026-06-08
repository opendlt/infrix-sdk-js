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
       * Verify a portable proof OFFLINE (structural + local cryptographic
       * checks, no network). The result's `verified` reflects only offline
       * checks; for live-L0 confirmation use {@link verifyLiveL0} /
       * {@link verifyWithCLI}.
       */
      verifyOffline(pkg: PortableProof, opts: VerifyRequire = {}): ProofVerifyResult {
        return verifyLocalProof(pkg, opts);
      },

      /**
       * Back-compat alias of {@link verifyOffline}. Offline/structural only.
       * @deprecated prefer `verifyOffline` (unambiguous name).
       */
      verifyLocal(pkg: PortableProof, opts: VerifyRequire = {}): ProofVerifyResult {
        return verifyLocalProof(pkg, opts);
      },

      /**
       * Verify a proof with LIVE L0 confirmation by delegating to the canonical
       * `infrix verify` engine (the same one third parties run) — direct
       * in-SDK live verification is not available, so this shells out to the
       * CLI. Node-only. The result `mode` is always 'cli' so callers never
       * mistake it for an offline check.
       */
      async verifyLiveL0(
        pkg: PortableProof,
        opts: { l0: string; require?: string; cli?: string },
      ): Promise<CliVerifyResult> {
        return runInfrixVerify(pkg, { l0: opts.l0, require: opts.require, cli: opts.cli });
      },

      /**
       * Verify a proof by invoking the `infrix verify` CLI (full cryptographic
       * + optional live-L0 verification). Node-only; returns the CLI's verdict
       * + raw output. Use when you want the exact verification a third-party
       * auditor runs.
       */
      async verifyWithCLI(
        pkg: PortableProof,
        opts: { l0?: string; require?: string; cli?: string } = {},
      ): Promise<CliVerifyResult> {
        return runInfrixVerify(pkg, opts);
      },
    },
  };
}

/** Result of delegating verification to the `infrix verify` CLI. */
export interface CliVerifyResult {
  verified: boolean;
  /** Always 'cli' — this is NOT an offline structural check. */
  mode: 'cli';
  exitCode: number;
  output: string;
}

/** Lazily resolve Node's require (the SDK compiles to CommonJS). */
function nodeRequire(mod: string): unknown {
  const req = (globalThis as { require?: (m: string) => unknown }).require
    ?? (typeof require !== 'undefined' ? require : undefined);
  if (!req) {
    throw new Error('this method is Node-only (no require available in this runtime)');
  }
  return req(mod);
}

function runInfrixVerify(
  pkg: PortableProof,
  opts: { l0?: string; require?: string; cli?: string },
): CliVerifyResult {
  const cp = nodeRequire('child_process') as { spawnSync: (c: string, a: string[], o: unknown) => { status: number | null; stdout?: string; stderr?: string; error?: Error } };
  const fs = nodeRequire('fs') as { writeFileSync: (p: string, d: string) => void; rmSync: (p: string, o?: unknown) => void };
  const os = nodeRequire('os') as { tmpdir: () => string };
  const path = nodeRequire('path') as { join: (...p: string[]) => string };
  const tmp = path.join(os.tmpdir(), `infrix-proof-${process.pid}-${process.hrtime.bigint()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(pkg));
  try {
    const args = ['verify', tmp];
    if (opts.l0) args.push('--l0', opts.l0);
    if (opts.require) args.push('--require', opts.require);
    const res = cp.spawnSync(opts.cli ?? 'infrix', args, { encoding: 'utf8' });
    if (res.error) {
      throw new Error(`verifyWithCLI: could not run "${opts.cli ?? 'infrix'}": ${res.error.message}`);
    }
    return {
      verified: res.status === 0,
      mode: 'cli',
      exitCode: res.status ?? -1,
      output: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    };
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best-effort temp cleanup
    }
  }
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

/** Full structural witness-quorum verdict (see witnesses.verifyQuorum). */
export interface WitnessQuorumResult {
  /** Valid (reproduced) distinct-identity receipt count. */
  count: number;
  /** Distinct witness identities that reproduced the outcome. */
  distinctIdentities: number;
  /** Distinct independent operators (via the registry) among valid witnesses. */
  distinctOperators: number;
  /** Requested identity threshold. */
  threshold: number;
  /** Requested distinct-operator threshold. */
  operatorThreshold: number;
  /** identities >= threshold. */
  thresholdMet: boolean;
  /** distinct operators >= operatorThreshold. */
  operatorDiversityMet: boolean;
  /** Receipts older than maxAgeSeconds (when a freshness window is given). */
  staleReceipts: number;
  /** Valid receipts whose identity is absent from the registry (when given). */
  unauthorizedReceipts: number;
  identities: string[];
  operators: string[];
  /**
   * 'structural' — registry/replay/freshness checks only. L0 key-page
   * authorization of each witness key is performed by `infrix verify
   * --require-witness-threshold` (delegate via withProofs.verifyWithCLI).
   */
  mode: 'structural';
}

/** Options for witnesses.verifyQuorum. */
export interface WitnessQuorumOptions {
  threshold?: number;
  operatorThreshold?: number;
  /** Reject receipts older than this many seconds (needs nowUnix). */
  maxAgeSeconds?: number;
  /** Current time (unix seconds) for the freshness check; defaults to now. */
  nowUnix?: number;
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

      /**
       * Full structural witness-quorum verification: counts distinct reproduced
       * witnesses, maps them to independent operators via `registry`
       * (identity -> operator), and reports threshold, operator diversity,
       * stale receipts, and unauthorized (unregistered) receipts. The verdict
       * `mode` is always 'structural' — it does NOT perform L0 key-page
       * authorization (use withProofs.verifyWithCLI for the full `infrix verify`
       * witness check). It never claims more than it checks.
       */
      verifyQuorum(
        pkg: PortableProof,
        registry: Record<string, string> = {},
        opts: WitnessQuorumOptions = {},
      ): WitnessQuorumResult {
        const raw = (pkg.witnessReceipts as WitnessReceipt[] | undefined) ?? [];
        const threshold = opts.threshold ?? 1;
        const operatorThreshold = opts.operatorThreshold ?? 1;
        const hasRegistry = Object.keys(registry).length > 0;
        const now = opts.nowUnix ?? Math.floor(Date.now() / 1000);

        const validIdentities = new Set<string>();
        const operators = new Set<string>();
        let staleReceipts = 0;
        let unauthorizedReceipts = 0;

        for (const r of raw) {
          if (r.replayResult !== 'reproduced' || !r.witnessIdentity) continue;
          const ts = typeof r.timestamp === 'number' ? r.timestamp : undefined;
          if (opts.maxAgeSeconds && ts !== undefined && now - ts > opts.maxAgeSeconds) {
            staleReceipts++;
            continue; // stale receipts do not count toward the quorum
          }
          if (hasRegistry && !(r.witnessIdentity in registry)) {
            unauthorizedReceipts++;
            continue; // unregistered identity is not an authorized operator
          }
          validIdentities.add(r.witnessIdentity);
          if (hasRegistry) operators.add(registry[r.witnessIdentity]);
        }

        const identities = [...validIdentities].sort();
        const ops = [...operators].sort();
        // Without a registry, operator diversity is unknown; report operators as
        // the distinct identities only when a registry maps them.
        const distinctOperators = hasRegistry ? ops.length : 0;
        return {
          count: identities.length,
          distinctIdentities: identities.length,
          distinctOperators,
          threshold,
          operatorThreshold,
          thresholdMet: identities.length >= threshold,
          operatorDiversityMet: hasRegistry ? distinctOperators >= operatorThreshold : false,
          staleReceipts,
          unauthorizedReceipts,
          identities,
          operators: ops,
          mode: 'structural',
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
