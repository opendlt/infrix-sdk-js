/**
 * Scenario builder helpers (nextux-02): client-side types, the template
 * summaries, the "what do you want to prove" entry choices, and a pure
 * structural validator that mirrors the Go pkg/scenario rules closely enough to
 * give immediate builder feedback before a run.
 */

export type ScenarioNetwork = 'local' | 'kermit';

export interface Actor {
  kind: string;
}

export interface DisclosurePolicy {
  encryptedAtRest: boolean;
  regulatorCanView?: string[];
}

export interface Policy {
  releaseRequires?: string[];
  disclosure?: DisclosurePolicy;
}

export interface Step {
  id: string;
  action: string;
  actor?: string;
  fail?: string;
}

export interface ProofSpec {
  requireReplay?: boolean;
  requireWitnessThreshold?: number;
  minimumLevel?: string;
}

export interface ScenarioDraft {
  version: number;
  id: string;
  title: string;
  network: ScenarioNetwork;
  actors: Record<string, Actor>;
  policy: Policy;
  steps: Step[];
  proof: ProofSpec;
}

export interface TemplateSummary {
  id: string;
  title: string;
  promise: string;
  localSupport: boolean;
  kermitSupport: boolean;
}

/** The eight built-in templates (mirrors pkg/scenario). */
export const TEMPLATE_SUMMARIES: TemplateSummary[] = [
  { id: 'regulated-escrow', title: 'Regulated escrow with selective disclosure', promise: 'A regulated party released funds correctly, verifiable without seeing the private payload.', localSupport: true, kermitSupport: true },
  { id: 'release-evidence', title: 'Release evidence matches a commit and L0 anchor', promise: 'A release package matches a commit and an L0 anchor.', localSupport: true, kermitSupport: true },
  { id: 'witness-quorum', title: 'Two independent witnesses confirmed an event', promise: 'Two independent witnesses confirmed an event.', localSupport: false, kermitSupport: true },
  { id: 'selective-disclosure', title: 'A user disclosed only approved encrypted data', promise: 'A user disclosed only approved encrypted data.', localSupport: true, kermitSupport: true },
  { id: 'bridge-handoff', title: 'A cross-domain handoff settled under governance', promise: 'A cross-domain handoff settled under governance with a verifiable proof.', localSupport: false, kermitSupport: true },
  { id: 'restore-drill', title: 'State restored from L0 and re-verified', promise: 'A node restored its state from L0 and the proof still verifies.', localSupport: false, kermitSupport: true },
  { id: 'metamask-signing', title: 'A MetaMask user authorized a governed action', promise: 'A real wallet signature drove a governed intent.', localSupport: true, kermitSupport: true },
  { id: 'ai-agent-approved-workflow', title: 'An AI agent ran a governed workflow under approval', promise: 'An AI agent executed a governed workflow only after explicit approval.', localSupport: true, kermitSupport: true },
];

/** The first-screen question: what do you want to prove? */
export const ENTRY_CHOICES: { label: string; templateId: string }[] = [
  { label: 'A regulated party released funds correctly', templateId: 'regulated-escrow' },
  { label: 'A proof can be verified without trusting a node', templateId: 'selective-disclosure' },
  { label: 'Two independent witnesses confirmed an event', templateId: 'witness-quorum' },
  { label: 'A user disclosed only approved encrypted data', templateId: 'selective-disclosure' },
  { label: 'A release package matches a commit and L0 anchor', templateId: 'release-evidence' },
];

/** templateById returns a summary by id. */
export function templateById(id: string): TemplateSummary | undefined {
  return TEMPLATE_SUMMARIES.find((t) => t.id === id);
}

/**
 * validateScenarioShape gives fast client-side feedback. The Go validator is
 * authoritative; this catches the common mistakes before a run round-trip.
 */
export function validateScenarioShape(sc: ScenarioDraft): string[] {
  const errors: string[] = [];
  if (sc.version !== 1) errors.push('version must be 1');
  if (!sc.id) errors.push('id is required');
  if (!sc.title) errors.push('title is required');
  if (sc.network === ('mainnet' as ScenarioNetwork)) errors.push('network mainnet is not allowed');
  else if (sc.network !== 'local' && sc.network !== 'kermit') errors.push('network must be local or kermit');
  if (!sc.actors || Object.keys(sc.actors).length === 0) errors.push('at least one actor is required');
  if (!sc.steps || sc.steps.length === 0) errors.push('at least one step is required');
  const seen = new Set<string>();
  for (const st of sc.steps ?? []) {
    if (!st.id) errors.push('a step has no id');
    else if (seen.has(st.id)) errors.push(`duplicate step id ${st.id}`);
    else seen.add(st.id);
    if (!st.action) errors.push(`step ${st.id} has no action`);
    if (st.actor && sc.actors && !sc.actors[st.actor]) errors.push(`step ${st.id} references unknown actor ${st.actor}`);
  }
  if (sc.policy?.disclosure?.regulatorCanView?.length) {
    const hasAuthority = Object.values(sc.actors ?? {}).some((a) => a.kind === 'disclosureAuthority');
    if (!hasAuthority) errors.push('disclosure grants a regulator view but no disclosureAuthority actor exists');
  }
  return errors;
}
