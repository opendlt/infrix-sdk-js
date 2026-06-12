/**
 * @infrix fromPrompt — the hero-path one-liner (plan-06).
 *
 *   const app = await fromPrompt("regulated escrow with proof of release");
 *   const run = await app.run();
 *   const receipt = await run.verify();   // offline; never trusts the node
 *   await receipt.share();
 *
 * It is a thin, honest composition over the governed app.* agent actions:
 * assurance always comes from the verifier, a failed proof is NEVER hidden
 * (verify throws), and a share bundle cannot be produced without a verified
 * result. Local runs cap at L3; nothing targets mainnet.
 */

import { InfrixAgentClient } from '../agent/client.js';
import type { Assurance } from '../agent/actions.js';

/** Options for {@link fromPrompt}. */
export interface FromPromptOptions {
  /** The agent client that talks to the governed app.* surface. */
  client: InfrixAgentClient;
  /** Workspace name (default: derived from the prompt). */
  name?: string;
  /** Verification network; 'local' (default) caps at L3, 'kermit' reaches L4. */
  network?: string;
}

/** deriveName turns a prompt into a stable, filesystem-safe workspace name. */
function deriveName(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'hero-app';
}

/** A sealed, verified hero receipt — the only object that can be shared. */
export class HeroReceipt {
  constructor(
    private readonly client: InfrixAgentClient,
    private readonly name: string,
    /** The verifier's assurance verdict (Source = verifykit). */
    readonly assurance: Assurance
  ) {}

  /** share packs a self-contained, offline-verifiable proof bundle. */
  async share(): Promise<unknown> {
    const r = await this.client.run('app.share', { name: this.name });
    if (!r.ok) {
      throw new Error('app.share failed: ' + (r.errors[0]?.code ?? 'unknown'));
    }
    return r.data ?? r.artifacts;
  }
}

/** A completed hero run. verify() re-checks the proof offline. */
export class HeroRun {
  constructor(
    private readonly client: InfrixAgentClient,
    private readonly name: string,
    /** The run's assurance as produced (still must be re-verified). */
    readonly assurance: Assurance | undefined
  ) {}

  /**
   * verify re-verifies the proof OFFLINE and returns a shareable receipt.
   * It throws if the proof did not verify or did not come from the verifier
   * — a failed proof is never silently hidden.
   */
  async verify(): Promise<HeroReceipt> {
    const r = await this.client.run('app.verify', { name: this.name });
    const a = r.assurance;
    if (!r.ok || !a) {
      throw new Error('hero proof did not verify offline');
    }
    // The verifier never trusts the producing node; a contrary verdict is
    // dishonest and rejected. A bare/L0 proof level is not an offline pass.
    if (a.trustsInfrixNode) {
      throw new Error('assurance must not trust the node');
    }
    if (!a.proofLevel || a.proofLevel.toUpperCase() === 'L0') {
      throw new Error('hero proof did not reach a verifiable level offline');
    }
    return new HeroReceipt(this.client, this.name, a);
  }
}

/** A hero app built from a prompt. run() produces a governed proof. */
export class HeroApp {
  constructor(
    private readonly client: InfrixAgentClient,
    /** The workspace name. */
    readonly name: string,
    private readonly prompt: string,
    private readonly network: string
  ) {}

  /** run builds + runs the app through the canonical governed flow. */
  async run(): Promise<HeroRun> {
    const r = await this.client.run(
      'app.run',
      { name: this.name, prompt: this.prompt, network: this.network },
      { autoApprove: true }
    );
    if (!r.ok) {
      throw new Error('app.run failed: ' + (r.errors[0]?.code ?? 'unknown'));
    }
    return new HeroRun(this.client, this.name, r.assurance);
  }
}

/**
 * fromPrompt grounds a plain-language prompt into a hero app. The returned
 * app's run/verify/share chain is the canonical hero path.
 */
export async function fromPrompt(prompt: string, opts: FromPromptOptions): Promise<HeroApp> {
  if (!opts || !opts.client) {
    throw new Error('fromPrompt: an InfrixAgentClient is required (opts.client)');
  }
  const network = opts.network ?? 'local';
  if (network === 'mainnet') {
    throw new Error('fromPrompt: mainnet is not a valid hero-path network');
  }
  const name = opts.name ?? deriveName(prompt);
  // app.ask grounds the prompt read-only; a refusal surfaces here, before run.
  const ask = await opts.client.run('app.ask', { prompt, network });
  if (!ask.ok) {
    throw new Error('fromPrompt: could not ground the prompt: ' + (ask.errors[0]?.code ?? 'unknown'));
  }
  return new HeroApp(opts.client, name, prompt, network);
}
