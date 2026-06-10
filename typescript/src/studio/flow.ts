/**
 * @infrix studio — flow types (nextux-12).
 *
 * The studio flow format (.infrixflow.json) and small, honest helpers. These
 * mirror the Go pkg/studio types byte-for-byte so a flow drafted in TypeScript
 * validates and exports identically in Go.
 */

export const STUDIO_SCHEMA_VERSION = 1;

/** The networks a flow may target. Mainnet is intentionally absent. */
export type Network = 'local' | 'kermit';

/** The closed set of node kinds. Each maps to a real, gated capability. */
export type NodeKind =
  | 'actor'
  | 'approval'
  | 'workflow_action'
  | 'disclosure'
  | 'witness'
  | 'proof_export'
  | 'proof_verify'
  | 'cinema_replay'
  | 'inbox_review'
  | 'agent_approval';

export interface Actor {
  id: string;
  kind: string;
  label?: string;
}

export interface Node {
  id: string;
  kind: NodeKind;
  label: string;
  actor?: string;
  action?: string;
  config?: Record<string, unknown>;
}

export interface Edge {
  id?: string;
  from: string;
  to: string;
  label?: string;
}

export interface DisclosurePolicy {
  encryptedAtRest: boolean;
  regulatorCanView?: string[];
}

export interface Policies {
  releaseRequires?: string[];
  disclosure?: DisclosurePolicy;
  witnessThreshold?: number;
}

export interface Safety {
  requireDryRun: boolean;
  requireApprovalForWrites: boolean;
  mainnetDisabled: boolean;
  requireReplay?: boolean;
}

export interface Flow {
  version: number;
  title: string;
  description?: string;
  network: Network;
  actors: Actor[];
  nodes: Node[];
  edges: Edge[];
  policies: Policies;
  expectedOutputs?: string[];
  safety: Safety;
}

/** The kinds that require an unambiguous authority (an actor). */
export const AUTHORITY_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
  'actor',
  'approval',
  'inbox_review',
  'agent_approval',
  'disclosure',
]);

/** workflowActions returns the flow's workflow_action nodes in order. */
export function workflowActions(flow: Flow): Node[] {
  return flow.nodes.filter((n) => n.kind === 'workflow_action');
}

/** targetsMainnet reports whether a flow (illegally) targets mainnet. */
export function targetsMainnet(flow: Flow): boolean {
  return (flow.network as string) === 'mainnet';
}

/**
 * structuralIssues returns the studio's non-negotiable rule violations a flow
 * carries, in plain language. An empty array means the flow is structurally
 * valid (the Go validator additionally grounds workflow actions against the
 * real registry). This lets an agent or UI flag problems before export.
 */
export function structuralIssues(flow: Flow): string[] {
  const issues: string[] = [];
  if (flow.version !== STUDIO_SCHEMA_VERSION) issues.push(`unsupported version ${flow.version}`);
  if (!flow.title?.trim()) issues.push('title is required');
  if (targetsMainnet(flow)) issues.push('network mainnet is not allowed');
  else if (flow.network !== 'local' && flow.network !== 'kermit') issues.push(`network ${flow.network} is invalid`);
  if (!flow.actors?.length) issues.push('at least one actor is required');
  if (!flow.nodes?.length) issues.push('at least one node is required');
  if (!flow.safety?.mainnetDisabled) issues.push('safety.mainnetDisabled must be true');

  const actorIds = new Set((flow.actors ?? []).map((a) => a.id));
  const nodeIds = new Set((flow.nodes ?? []).map((n) => n.id));
  for (const n of flow.nodes ?? []) {
    if (n.actor && !actorIds.has(n.actor)) issues.push(`node ${n.id} references unknown actor ${n.actor}`);
    if (n.kind === 'workflow_action' && !n.action?.trim())
      issues.push(`workflow_action node ${n.id} has no action (it would bypass canonical execution)`);
    if (AUTHORITY_KINDS.has(n.kind) && n.kind !== 'disclosure' && !n.actor?.trim())
      issues.push(`${n.kind} node ${n.id} has no actor — its authority is ambiguous`);
  }
  for (const [i, e] of (flow.edges ?? []).entries()) {
    if (!nodeIds.has(e.from)) issues.push(`edge #${i} references unknown node ${e.from}`);
    if (!nodeIds.has(e.to)) issues.push(`edge #${i} references unknown node ${e.to}`);
    if (e.from === e.to) issues.push(`edge #${i} is a self-loop on ${e.from}`);
  }
  if (workflowActions(flow).length > 0 && (!flow.safety?.requireDryRun || !flow.safety?.requireApprovalForWrites))
    issues.push('a flow with a workflow action must require a dry-run and approval');
  return issues;
}

/** isStructurallyValid is a convenience over {@link structuralIssues}. */
export function isStructurallyValid(flow: Flow): boolean {
  return structuralIssues(flow).length === 0;
}
