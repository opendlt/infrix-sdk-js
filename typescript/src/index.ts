/**
 * @infrix/client — Policy-governed execution and evidence layer for Accumulate.
 *
 * All operations flow through the canonical governance spine:
 *   Intent -> Plan -> Approval -> Execution -> Outcome -> Evidence -> Anchor
 *
 * Primary sub-clients (governance spine):
 *   client.intents.*       — Submit governed operations
 *   client.policies.*      — Evaluate governance policies
 *   client.approvals.*     — Manage approval workflows
 *   client.evidence.*      — Inspect evidence chains
 *   client.trust.*         — Manage external dependency trust
 *   client.anchors.*       — Verify L0 anchor proofs
 *
 * Secondary sub-clients (protocol primitives):
 *   client.objects.*       — Governed object operations
 *   client.roles.*         — Role binding management
 *   client.capabilities.*  — Capability grant management
 *   client.settlements.*   — Settlement instructions
 *   client.escrows.*       — Escrow management
 *   client.disclosures.*   — Disclosure grant management
 *
 * Contract inspection (read-only only):
 *   client.contracts.*     — query, simulate, inspect, schema
 *   Contract mutations (deploy/call/upgrade) must be submitted as intents
 *   via client.intents.submit({ type: 'CONTRACT_DEPLOY' | 'CONTRACT_CALL' |
 *   'CONTRACT_UPGRADE', ... }).
 *
 * @example
 *   import { InfrixClient } from '@infrix/client';
 *   const client = new InfrixClient('http://localhost:8080');
 *
 *   // Governance-first: submit a CONTRACT_CALL intent
 *   const result = await client.intents.submit({
 *     type: 'CONTRACT_CALL',
 *     customParams: {
 *       contract: 'acc://mytoken.acme',
 *       function: 'transfer',
 *       args: ['acc://bob.acme/tokens', '100'],
 *     },
 *   });
 */

// ---- Re-export types ----

export type {
  CallResult,
  QueryResult,
  TransactionReceipt,
  ContractInfo,
  TraceStep,
  TraceResult,
  ExplorerStatus,
  IndexedEvent,
  EventFilterParams,
  ReceiptFilterParams,
  StateDiffFilterParams,
  IndexedStateDiff,
  ContractStatsResult,
  NetworkStatsResult,
  ContractSchema,
  FunctionSchemaEntry,
  ParamSchemaEntry,
  EventSchemaEntry,
  FieldSchemaEntry,
  ErrorSchemaEntry,
  DevnetEvent,
} from './types/contract';

export * from './types/governance';

export { withGovernanceSugar, waitForCompletion, InfrixGovernanceError } from './sugar';
export type { GovernedResult, GovernedOptions } from './sugar';

export { withGoldenApp } from './golden/escrow';
export type {
  EscrowCreateParams,
  EscrowHandle,
  EscrowReleaseParams,
  PortableProof,
} from './golden/escrow';

export {
  SubClient,
  IntentSubClient,
  ObjectSubClient,
  PolicySubClient,
  ApprovalSubClient,
  EvidenceSubClient,
  TrustSubClient,
  CapabilitySubClient,
  RoleSubClient,
  SettlementSubClient,
  EscrowSubClient,
  DisclosureSubClient,
  AnchorSubClient,
  ContractSubClient,
  PredicateSubClient,
  EIP712SubClient,
} from './sub-clients';

// ---- Direct imports for internal use ----

import type { DevnetEvent } from './types/contract';

import {
  IntentSubClient,
  ObjectSubClient,
  PolicySubClient,
  ApprovalSubClient,
  EvidenceSubClient,
  TrustSubClient,
  CapabilitySubClient,
  RoleSubClient,
  SettlementSubClient,
  EscrowSubClient,
  DisclosureSubClient,
  AnchorSubClient,
  ContractSubClient,
  PredicateSubClient,
  EIP712SubClient,
} from './sub-clients';

// ---- RPC Error ----

export class InfrixRPCError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'InfrixRPCError';
    this.code = code;
  }
}

// ---- Client ----

export class InfrixClient {
  private rpcUrl: string;
  private wsUrl: string;
  private idCounter = 0;

  // ---- PRIMARY: Governance Sub-Clients ----

  /** Intent lifecycle: submit, plan, approve, outcome, evidence. */
  readonly intents: IntentSubClient;

  /** Governed object operations: list, get, create, transition, audit. */
  readonly objects: ObjectSubClient;

  /** Policy evaluation and management: list, evaluate, simulate, decisions, conflicts. */
  readonly policies: PolicySubClient;

  /** Approval management: submit, list, pending, revoke. */
  readonly approvals: ApprovalSubClient;

  /** Evidence chain access: get, verify, export, anchor. */
  readonly evidence: EvidenceSubClient;

  /** Trust profile evaluation: list, get, evaluate, compare. */
  readonly trust: TrustSubClient;

  /** Capability grant management: list, grants, grant, revoke, check. */
  readonly capabilities: CapabilitySubClient;

  /** Role binding management: list, assign, check, revoke. */
  readonly roles: RoleSubClient;

  /** Settlement instruction management: list, create, approve, get. */
  readonly settlements: SettlementSubClient;

  /** Escrow management: list, create, release, dispute, get. */
  readonly escrows: EscrowSubClient;

  /** Disclosure grant management: list, grant, check, revoke. */
  readonly disclosures: DisclosureSubClient;

  /** L0 anchor verification: list, verify, stats, get. */
  readonly anchors: AnchorSubClient;

  /** ZK predicate catalog + read-only proof verification (catalog, verify). */
  readonly predicates: PredicateSubClient;

  /** MetaMask EIP-712 intent signing -> Accumulate submission (prepare, submit). */
  readonly eip712: EIP712SubClient;

  // ---- Read-only Contract Inspection ----

  /**
   * Read-only contract inspection: query, simulate, inspect, schema.
   * State-changing contract operations (deploy, call, upgrade) must be
   * submitted as intents via `client.intents.submit(...)`.
   */
  readonly contracts: ContractSubClient;

  private restBase: string;
  private defaultDisclosure: {
    actor?: string;
    purpose?: string;
    workflowInstance?: string;
    identity?: string;
  } = {};

  /**
   * Set the default Gap 12 disclosure context that every RPC call
   * will inject if the caller does not supply its own actor / purpose /
   * workflowInstance. Server-side handlers reject calls without
   * disclosure context, so most operations require at least an actor
   * + purpose to be set.
   *
   * @example
   *   client.setDisclosureContext({
   *     actor: 'acc://operator.acme',
   *     purpose: 'operational',
   *     workflowInstance: 'demo-001',
   *   });
   */
  setDisclosureContext(ctx: {
    actor?: string;
    purpose?: string;
    workflowInstance?: string;
    identity?: string;
  }): void {
    this.defaultDisclosure = { ...this.defaultDisclosure, ...ctx };
  }

  /**
   * Create a client connected to an Infrix devnet.
   * @param baseUrl The base URL of the devnet server, e.g. "http://localhost:8080"
   */
  constructor(baseUrl: string) {
    const base = baseUrl.replace(/\/+$/, '');
    this.rpcUrl = `${base}/rpc`;
    this.wsUrl = base.replace(/^http/, 'ws') + '/ws';
    this.restBase = base;

    const rpcFn = this.rpc.bind(this);
    const restFn = this.rest.bind(this);

    // PRIMARY: Governance sub-clients
    this.intents = new IntentSubClient(rpcFn, restFn);
    this.objects = new ObjectSubClient(rpcFn, restFn);
    this.policies = new PolicySubClient(rpcFn, restFn);
    this.approvals = new ApprovalSubClient(rpcFn, restFn);
    this.evidence = new EvidenceSubClient(rpcFn, restFn);
    this.trust = new TrustSubClient(rpcFn, restFn);
    this.capabilities = new CapabilitySubClient(rpcFn, restFn);
    this.roles = new RoleSubClient(rpcFn, restFn);
    this.settlements = new SettlementSubClient(rpcFn, restFn);
    this.escrows = new EscrowSubClient(rpcFn, restFn);
    this.disclosures = new DisclosureSubClient(rpcFn, restFn);
    this.anchors = new AnchorSubClient(rpcFn, restFn);
    this.predicates = new PredicateSubClient(rpcFn, restFn);
    this.eip712 = new EIP712SubClient(rpcFn, restFn);

    // SECONDARY: Contract sub-client
    this.contracts = new ContractSubClient(rpcFn, restFn);
  }

  // ---- Low-level RPC ----

  private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.idCounter;
    // Inject the default Gap 12 disclosure context for any field the
    // caller did not already set. Keeps callers from having to thread
    // actor / purpose / workflowInstance through every sub-client call.
    const mergedParams: Record<string, unknown> = { ...params };
    for (const k of ['actor', 'purpose', 'workflowInstance', 'identity'] as const) {
      if (mergedParams[k] === undefined && this.defaultDisclosure[k] !== undefined) {
        mergedParams[k] = this.defaultDisclosure[k];
      }
    }
    const body = JSON.stringify({ jsonrpc: '2.0', method, params: mergedParams, id });
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const json = await res.json();
    if (json.error) {
      throw new InfrixRPCError(json.error.code, json.error.message);
    }
    return json.result as T;
  }

  /**
   * Low-level REST against /v4/* endpoints. Parses the V4 envelope
   * (V4Response{Data, Governance, Meta} or V4Response{Error, Meta} per
   * pkg/api/v4/rest/middleware.go) and returns `result.data` on success
   * or throws InfrixRPCError on the envelope's error code+message.
   */
  private async rest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.restBase}${path}`;
    // Inject the Gap 12 disclosure context as headers (X-Actor /
    // X-Purpose / X-Workflow-Instance). Non-exempt /v4/* routes reject
    // requests missing these with 400; mirroring the RPC path's
    // default-context injection so REST sub-clients need no per-call
    // header plumbing.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.defaultDisclosure.actor) headers['X-Actor'] = this.defaultDisclosure.actor;
    if (this.defaultDisclosure.purpose) headers['X-Purpose'] = this.defaultDisclosure.purpose;
    if (this.defaultDisclosure.workflowInstance)
      headers['X-Workflow-Instance'] = this.defaultDisclosure.workflowInstance;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const json = await res.json();
    if (json && json.error) {
      const code = typeof json.error.code === 'number' ? json.error.code : -32603;
      const msg = typeof json.error.message === 'string' ? json.error.message : 'rest error';
      throw new InfrixRPCError(code, msg);
    }
    return (json && json.data !== undefined ? json.data : json) as T;
  }

  // ---- WebSocket Subscriptions ----

  /**
   * Subscribe to real-time devnet events via WebSocket.
   *
   * @param onEvent  Callback invoked for each event.
   * @param eventType  Optional filter (e.g. "contract.deployed"). Omit for all events.
   * @returns A function that closes the connection when called.
   *
   * @example
   *   const unsub = client.subscribe((event) => console.log(event));
   *   // ... later ...
   *   unsub();
   */
  subscribe(onEvent: (event: DevnetEvent) => void, eventType?: string): () => void {
    // Use dynamic import of 'ws' in Node, or native WebSocket in browser.
    const g = globalThis as { WebSocket?: typeof WebSocket; require?: (m: string) => unknown };
    const WS: typeof WebSocket = g.WebSocket ?? (g.require ? (g.require('ws') as typeof WebSocket) : (undefined as unknown as typeof WebSocket));
    const ws = new WS(this.wsUrl);

    ws.onopen = () => {
      if (eventType) {
        ws.send(JSON.stringify({ action: 'subscribe', eventType }));
      }
    };

    ws.onmessage = (msg: { data: unknown }) => {
      try {
        const raw = typeof msg.data === 'string'
          ? msg.data
          : (msg.data as { toString(): string }).toString();
        const event = JSON.parse(raw);
        onEvent(event);
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      ws.close();
    };
  }

  /**
   * Alias of `subscribe` for callers that prefer the verbose name.
   * Some sub-clients (shapes, swarm) call this internally.
   */
  subscribeEvents(_filter: unknown, onEvent: (event: Record<string, unknown>) => void): () => void {
    return this.subscribe(onEvent as unknown as (event: DevnetEvent) => void);
  }

  // ---- Shape-Shifting Contracts ----

  /** Shapes sub-client for shape-shifting contract queries. */
  shapes = {
    /** Get the current active shape for a contract. */
    current: (contractUrl: string): Promise<ShapeInfo> => {
      return this.rpc<ShapeInfo>('shapes.current', { url: contractUrl });
    },

    /** List all defined shapes for a contract. */
    list: (contractUrl: string): Promise<ShapeListResult> => {
      return this.rpc<ShapeListResult>('shapes.list', { url: contractUrl });
    },

    /** Get evolution rules for a contract. */
    rules: (contractUrl: string): Promise<ShapeRulesResult> => {
      return this.rpc<ShapeRulesResult>('shapes.rules', { url: contractUrl });
    },

    /** Get shape transition history. */
    history: (contractUrl: string, opts?: { limit?: number }): Promise<ShapeHistoryResult> => {
      return this.rpc<ShapeHistoryResult>('shapes.history', {
        url: contractUrl,
        limit: opts?.limit ?? 10,
      });
    },

    /** Get the current shape's parameters. */
    params: (contractUrl: string): Promise<ShapeParamsResult> => {
      return this.rpc<ShapeParamsResult>('shapes.params', { url: contractUrl });
    },

    /** Subscribe to shape transitions via WebSocket. */
    subscribe: (contractUrl: string, onTransition: (t: ShapeTransitionEvent) => void): (() => void) => {
      return this.subscribeEvents(contractUrl, (event: Record<string, unknown>) => {
        if (event.type === 'shape_transition') {
          onTransition(event as unknown as ShapeTransitionEvent);
        }
      });
    },
  };
}

// ---- Shape-Shifting Types ----

export interface ShapeInfo {
  contract_url: string;
  shape_name: string;
  activated_at: number;
  blocks_active: number;
}

export interface ShapeDefinition {
  name: string;
  description?: string;
  parameters: ShapeParameterDef[];
  color?: string;
  priority?: number;
}

export interface ShapeParameterDef {
  name: string;
  type: string;
  value: unknown;
  description?: string;
}

export interface ShapeListResult {
  contract_name: string;
  default_shape: string;
  active_shape: string;
  shapes: ShapeDefinition[];
}

export interface EvolutionRuleDef {
  name: string;
  description?: string;
  condition: string;
  target_shape: string;
  source_shapes?: string[];
  priority: number;
  duration_blocks?: number;
  enabled: boolean;
}

export interface ShapeRulesResult {
  rules: EvolutionRuleDef[];
}

export interface ShapeTransitionRecord {
  contract_url: string;
  from_shape: string;
  to_shape: string;
  block_height: number;
  timestamp: number;
  trigger_rule: string;
  trigger_condition: string;
  duration_blocks_satisfied: number;
  previous_shape_duration: number;
  gas_consumed: number;
  immune_reconfigured: boolean;
}

export interface ShapeHistoryResult {
  transitions: ShapeTransitionRecord[];
  total_transitions: number;
  time_in_shape: Record<string, number>;
}

export interface ShapeParamsResult {
  shape_name: string;
  parameters: ShapeParameterDef[];
}

export interface ShapeTransitionEvent {
  type: 'shape_transition';
  contract_url: string;
  from_shape: string;
  to_shape: string;
  block_height: number;
  rule: string;
  gas_used: number;
}

// ---- Swarm Contract Types ----

export interface SwarmStatus {
  id: string;
  name: string;
  collective_immune_state: string;
  version: number;
  dissolved: boolean;
  members: SwarmMemberInfo[];
  channel_size: number;
}

export interface SwarmMemberInfo {
  address: string;
  alias: string;
  role?: string;
  state: string;
}

export interface SwarmChannelValue {
  key: string;
  value: string;
  type?: string;
}

export interface SwarmCoordinateResult {
  action_name: string;
  step_results: SwarmStepResult[];
  gas_used: number;
  block_height: number;
}

export interface SwarmStepResult {
  step_index: number;
  target_member: string;
  function: string;
  return_value?: string;
  gas_used: number;
  error?: string;
  reverted: boolean;
}

export interface SwarmUpgradeResult {
  proposal_id: string;
  status: string;
  compatibility_results: SwarmCompatResult[];
}

export interface SwarmCompatResult {
  member_alias: string;
  compatible: boolean;
  issues?: string[];
}

/** SwarmClient provides methods for interacting with swarm contracts. */
export class SwarmClient {
  constructor(private rpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>) {}

  /** Get swarm status. */
  async status(swarmId: string): Promise<SwarmStatus> {
    return this.rpc<SwarmStatus>('swarm.status', { id: swarmId });
  }

  /** Read a channel value. */
  async channelGet(swarmId: string, key: string): Promise<SwarmChannelValue> {
    return this.rpc<SwarmChannelValue>('swarm.channel.get', { swarm_id: swarmId, key });
  }

  /** Write a channel value. */
  async channelSet(swarmId: string, key: string, value: string): Promise<void> {
    await this.rpc<void>('swarm.channel.set', { swarm_id: swarmId, key, value });
  }

  /** Execute a coordinated action. */
  async coordinate(swarmId: string, action: string, args: Record<string, unknown> = {}): Promise<SwarmCoordinateResult> {
    return this.rpc<SwarmCoordinateResult>('swarm.coordinate', { swarm_id: swarmId, action, args });
  }

  /** Add a member to the swarm. */
  async addMember(swarmId: string, address: string, alias: string, role?: string): Promise<void> {
    await this.rpc<void>('swarm.add_member', { swarm_id: swarmId, address, alias, role });
  }

  /** Remove a member from the swarm. */
  async removeMember(swarmId: string, alias: string): Promise<void> {
    await this.rpc<void>('swarm.remove_member', { swarm_id: swarmId, alias });
  }

  /** Resume a swarm from collective immune state. */
  async resume(swarmId: string): Promise<void> {
    await this.rpc<void>('swarm.resume', { swarm_id: swarmId });
  }

  /** Dissolve a swarm. */
  async dissolve(swarmId: string): Promise<void> {
    await this.rpc<void>('swarm.dissolve', { swarm_id: swarmId });
  }

  /** Submit an upgrade proposal. */
  async upgrade(swarmId: string, proposal: Record<string, unknown>): Promise<SwarmUpgradeResult> {
    return this.rpc<SwarmUpgradeResult>('swarm.upgrade', { swarm_id: swarmId, ...proposal });
  }
}

// ---- Mission Control Types ----

export interface MissionMetrics {
  contract_url: string;
  block_height: number;
  calls_total: number;
  calls_per_block: number;
  error_rate: number;
  gas_total: number;
  gas_per_call: { p50: number; p95: number; p99: number; avg: number };
  unique_callers: number;
  breaker_state: string;
  confidence_score: number;
  anomaly_score: number;
  uptime: number;
  active_shape?: string;
  swarm_id?: string;
}

export interface MissionSLOStatus {
  name: string;
  metric: string;
  target: number;
  current_value: number;
  compliance: number;
  healthy: boolean;
  burn_rate: number;
}

export interface MissionAlert {
  id: string;
  contract_url: string;
  severity: string;
  title: string;
  metric_name: string;
  metric_value: number;
  status: string;
}

export interface MissionCostReport {
  contract_url: string;
  period: string;
  total_gas: number;
  total_cost_usd: number;
  by_function: { function: string; call_count: number; total_gas: number; cost_usd: number; pct_of_total: number }[];
  recommendations: { function: string; type: string; description: string }[];
}

export interface MissionLogEntry {
  timestamp: number;
  level: string;
  contract: string;
  function?: string;
  block_height: number;
  message: string;
}

/** MissionClient provides production observability methods. */
export class MissionClient {
  constructor(private rpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>) {}

  async status(contract: string): Promise<MissionMetrics> {
    return this.rpc<MissionMetrics>('mission.status', { contract });
  }
  async sloList(contract: string): Promise<MissionSLOStatus[]> {
    const r = await this.rpc<{ slos: MissionSLOStatus[] }>('mission.slo.list', { contract });
    return r.slos;
  }
  async sloCreate(contract: string, metric: string, target: number, window: string): Promise<void> {
    await this.rpc<void>('mission.slo.create', { contract, metric, target, window });
  }
  async alerts(): Promise<MissionAlert[]> {
    const r = await this.rpc<{ alerts: MissionAlert[] }>('mission.alert.list', {});
    return r.alerts;
  }
  async cost(contract: string, period = '30d'): Promise<MissionCostReport> {
    return this.rpc<MissionCostReport>('mission.cost', { contract, period });
  }
  async logs(contract: string, opts?: { level?: string; limit?: number }): Promise<MissionLogEntry[]> {
    const r = await this.rpc<{ logs: MissionLogEntry[] }>('mission.logs', { contract, ...opts });
    return r.logs;
  }
  async global(): Promise<Record<string, unknown>> {
    return this.rpc<Record<string, unknown>>('mission.global', {});
  }
}

// Default export for convenience.
export default InfrixClient;
