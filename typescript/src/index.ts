/**
 * @infrix/client — TypeScript client for the Infrix governance platform.
 *
 * The primary API surface is governance-oriented:
 *   client.intents.*       — Intent lifecycle (submit, plan, approve, outcome)
 *   client.objects.*       — Governed object operations
 *   client.policies.*      — Policy evaluation and management
 *   client.approvals.*     — Approval management
 *   client.evidence.*      — Evidence chain access
 *   client.trust.*         — Trust profile evaluation
 *   client.capabilities.*  — Capability grant management
 *   client.roles.*         — Role binding management
 *   client.settlements.*   — Settlement instructions
 *   client.escrows.*       — Escrow management
 *   client.disclosures.*   — Disclosure grant management
 *   client.anchors.*       — L0 anchor verification
 *
 * Contract operations are available via client.contracts.* for low-level access.
 *
 * @example
 *   import { InfrixClient } from '@infrix/client';
 *   const client = new InfrixClient('http://localhost:8080');
 *
 *   // Governance-first: submit an intent
 *   const result = await client.intents.submit({
 *     type: 'TRANSFER',
 *     sourceAssets: [{ asset: 'ACME', amount: 100 }],
 *     targetState: { stateType: 'balance_increase', parameters: { account: 'acc://bob.acme/tokens' } }
 *   });
 *
 *   // Low-level: direct contract call (bypasses governance)
 *   const receipt = await client.contracts.deploy('acc://my.acme/counter', wasmHex);
 *   const callResult = await client.contracts.call('acc://my.acme/counter', 'increment');
 */

// ---- Re-export types ----

export type {
  DeployResult,
  CallResult,
  QueryResult,
  TransactionReceipt,
  ContractInfo,
  UpgradeResult,
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
  BatchCallRequest,
  BatchCallResult,
  DevnetEvent,
} from './types/contract';

export * from './types/governance';

export { withGovernanceSugar } from './sugar';
export type { GovernedResult } from './sugar';

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
} from './sub-clients';

// ---- Direct imports for internal use ----

import type {
  DeployResult,
  CallResult,
  QueryResult,
  TransactionReceipt,
  ContractInfo,
  UpgradeResult,
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
  BatchCallRequest,
  BatchCallResult,
  DevnetEvent,
} from './types/contract';

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

  // ---- SECONDARY: Contract Sub-Client ----

  /** Low-level contract operations (deploy, call, query, upgrade, inspect). Bypasses governance. */
  readonly contracts: ContractSubClient;

  /**
   * Create a client connected to an Infrix devnet.
   * @param baseUrl The base URL of the devnet server, e.g. "http://localhost:8080"
   */
  constructor(baseUrl: string) {
    const base = baseUrl.replace(/\/+$/, '');
    this.rpcUrl = `${base}/rpc`;
    this.wsUrl = base.replace(/^http/, 'ws') + '/ws';

    const rpcFn = this.rpc.bind(this);

    // PRIMARY: Governance sub-clients
    this.intents = new IntentSubClient(rpcFn);
    this.objects = new ObjectSubClient(rpcFn);
    this.policies = new PolicySubClient(rpcFn);
    this.approvals = new ApprovalSubClient(rpcFn);
    this.evidence = new EvidenceSubClient(rpcFn);
    this.trust = new TrustSubClient(rpcFn);
    this.capabilities = new CapabilitySubClient(rpcFn);
    this.roles = new RoleSubClient(rpcFn);
    this.settlements = new SettlementSubClient(rpcFn);
    this.escrows = new EscrowSubClient(rpcFn);
    this.disclosures = new DisclosureSubClient(rpcFn);
    this.anchors = new AnchorSubClient(rpcFn);

    // SECONDARY: Contract sub-client
    this.contracts = new ContractSubClient(rpcFn);
  }

  // ---- Low-level RPC ----

  private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.idCounter;
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id });
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

  // ---- Deprecated Top-Level Contract Methods (backward compatibility) ----

  /** @deprecated Use client.contracts.deploy() */
  async deploy(url: string, bytecodeHex: string, gasLimit = 500000): Promise<DeployResult> {
    return this.contracts.deploy(url, bytecodeHex, { gasLimit });
  }

  /** @deprecated Use client.contracts.call() */
  async call(url: string, fn: string, args: unknown[] = [], gasLimit = 500000): Promise<CallResult> {
    return this.contracts.call(url, fn, args, { gasLimit });
  }

  /** @deprecated Use client.contracts.query() */
  async query(url: string, fn: string, args: unknown[] = [], gasLimit = 500000): Promise<QueryResult> {
    return this.contracts.query(url, fn, args);
  }

  /** @deprecated Use client.contracts.upgrade() */
  async upgrade(url: string, bytecodeHex: string): Promise<UpgradeResult> {
    return this.contracts.upgrade(url, bytecodeHex);
  }

  /** @deprecated Use client.contracts.inspect() */
  async inspect(url: string): Promise<ContractInfo> {
    return this.contracts.inspect(url);
  }

  // ---- Deprecated Transaction History ----

  /** @deprecated Retrieve a transaction receipt by hash. */
  async getTransaction(txHash: string): Promise<TransactionReceipt> {
    return this.rpc<TransactionReceipt>('tx.get', { txHash });
  }

  /** @deprecated Retrieve a detailed execution trace for a transaction. */
  async getTrace(txHash: string): Promise<TraceResult> {
    return this.rpc<TraceResult>('tx.trace', { txHash });
  }

  // ---- Deprecated Batch Execution ----

  /** @deprecated Use client.contracts.callBatch() */
  async callBatch(calls: BatchCallRequest[]): Promise<BatchCallResult[]> {
    return this.contracts.callBatch(calls);
  }

  // ---- Deprecated Index Queries ----

  /** @deprecated Query indexed events with filtering. */
  async queryEvents(filter: EventFilterParams = {}): Promise<{ events: IndexedEvent[]; total: number }> {
    return this.rpc<{ events: IndexedEvent[]; total: number }>('index.getEvents', filter as Record<string, unknown>);
  }

  /** @deprecated Query indexed events by transaction hash. */
  async queryEventsByTx(txHash: string): Promise<IndexedEvent[]> {
    const result = await this.rpc<{ events: IndexedEvent[] }>('index.getEventsByTx', { txHash });
    return result.events;
  }

  /** @deprecated Query indexed receipts with filtering. */
  async queryReceipts(filter: ReceiptFilterParams = {}): Promise<{ receipts: TransactionReceipt[]; total: number }> {
    return this.rpc<{ receipts: TransactionReceipt[]; total: number }>('index.getReceipts', filter as Record<string, unknown>);
  }

  /** @deprecated Query indexed state diffs with filtering. */
  async queryStateDiffs(filter: StateDiffFilterParams = {}): Promise<{ diffs: IndexedStateDiff[] }> {
    return this.rpc<{ diffs: IndexedStateDiff[] }>('index.getStateDiffs', filter as Record<string, unknown>);
  }

  /** @deprecated Get aggregate statistics for a specific contract. */
  async getContractStats(contractUrl: string): Promise<ContractStatsResult> {
    return this.rpc<ContractStatsResult>('index.getContractStats', { contractUrl });
  }

  /** @deprecated Get aggregate network statistics. */
  async getNetworkStats(): Promise<NetworkStatsResult> {
    return this.rpc<NetworkStatsResult>('index.getNetworkStats');
  }

  // ---- Deprecated Explorer ----

  /** @deprecated Get devnet status (block height, counts, uptime). */
  async status(): Promise<ExplorerStatus> {
    return this.rpc<ExplorerStatus>('explorer.status');
  }

  /** @deprecated List all deployed contracts. */
  async listContracts(): Promise<ContractInfo[]> {
    const result = await this.rpc<{ contracts: ContractInfo[] }>('explorer.contracts');
    return result.contracts;
  }

  /** @deprecated List recent transactions. */
  async listTransactions(): Promise<TransactionReceipt[]> {
    const result = await this.rpc<{ transactions: TransactionReceipt[] }>('explorer.transactions');
    return result.transactions;
  }

  /** @deprecated Get event history, optionally filtered by type. */
  async eventHistory(eventType?: string): Promise<DevnetEvent[]> {
    const result = await this.rpc<{ events: DevnetEvent[] }>('events.history', { eventType: eventType ?? '' });
    return result.events;
  }

  // ---- Deprecated Schema & Runtime Binding ----

  /** @deprecated Use client.contracts.schema() */
  async getSchema(url: string): Promise<ContractSchema | null> {
    return this.contracts.schema(url);
  }

  /**
   * @deprecated Create a runtime binding for a deployed contract using its embedded schema.
   *
   * Returns a Proxy object where method calls are automatically mapped to
   * the contract's functions via JSON-RPC. View functions use `query`,
   * mutable functions use `call`.
   *
   * @example
   *   const counter = await client.bind('acc://my.acme/counter');
   *   await counter.increment();
   *   const count = await counter.get_count();
   */
  async bind(url: string): Promise<Record<string, (...args: unknown[]) => Promise<unknown>>> {
    const schema = await this.getSchema(url);
    if (!schema) {
      throw new InfrixRPCError(-1, `Contract ${url} does not have an embedded schema`);
    }

    const client = this;
    const fnMap = new Map<string, { mutability: string }>();
    for (const fn of schema.functions) {
      fnMap.set(fn.name, { mutability: fn.mutability });
    }

    return new Proxy({} as Record<string, (...args: unknown[]) => Promise<unknown>>, {
      get(_target, prop: string) {
        const fnInfo = fnMap.get(prop);
        if (!fnInfo) {
          return undefined;
        }
        return async (...args: unknown[]) => {
          if (fnInfo.mutability === 'view') {
            const result = await client.query(url, prop, args);
            return result.returnData;
          } else {
            const result = await client.call(url, prop, args);
            return result;
          }
        };
      },
      has(_target, prop: string) {
        return fnMap.has(prop);
      },
      ownKeys() {
        return Array.from(fnMap.keys());
      },
    });
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
    const WS = typeof WebSocket !== 'undefined' ? WebSocket : require('ws');
    const ws = new WS(this.wsUrl);

    ws.onopen = () => {
      if (eventType) {
        ws.send(JSON.stringify({ action: 'subscribe', eventType }));
      }
    };

    ws.onmessage = (msg: { data: string | Buffer }) => {
      try {
        const event = JSON.parse(typeof msg.data === 'string' ? msg.data : msg.data.toString());
        onEvent(event);
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      ws.close();
    };
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

// ---- Intent Graph Types (legacy, kept for backward compatibility) ----

export interface IntentResolveResult {
  intentId: string;
  status: string;
  rankedPaths?: { paths: IntentRankedPath[] };
  ambiguous?: boolean;
  candidates?: { confidence: number; explanation: string }[];
}

export interface IntentRankedPath {
  rank: number;
  score: number;
  path: { id: string; hopCount: number; totalGasEstimate: number; assetFlow: string[] };
  simResult?: { success: boolean; actualOutput: number; totalGasUsed: number; slippage: number };
}

export interface IntentExecuteResult {
  intentId: string;
  status: string;
  executionResult?: { success: boolean; actualOutput: number; outputAsset: string; totalGasUsed: number; matchesGhost: boolean };
  txHash?: string;
  blockHeight?: number;
}

export interface IntentGraphNode {
  id: string;
  name: string;
  category: string;
  confidenceScore: number;
  immuneState: string;
  tokenAssets?: string[];
  functionCount: number;
}

/** IntentClient provides legacy intent-based execution methods. */
export class IntentClient {
  constructor(private rpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>) {}

  async resolve(input: string, userAddress: string): Promise<IntentResolveResult> {
    return this.rpc<IntentResolveResult>('intent.resolve', { input, userAddress });
  }
  async execute(intentId: string, pathRank = 1): Promise<IntentExecuteResult> {
    return this.rpc<IntentExecuteResult>('intent.execute', { intentId, pathRank });
  }
  async confirm(intentId: string, candidateIndex: number): Promise<{ status: string }> {
    return this.rpc<{ status: string }>('intent.confirm', { intentId, candidateIndex });
  }
  async status(intentId: string): Promise<{ intentId: string; status: string }> {
    return this.rpc<{ intentId: string; status: string }>('intent.status', { intentId });
  }
  async paths(intentId: string): Promise<{ rankedPaths: { paths: IntentRankedPath[] } }> {
    return this.rpc<{ rankedPaths: { paths: IntentRankedPath[] } }>('intent.paths', { intentId });
  }
  async graphQuery(opts?: { category?: string; asset?: string; function?: string }): Promise<{ nodes?: IntentGraphNode[]; stats?: Record<string, number> }> {
    return this.rpc<{ nodes?: IntentGraphNode[]; stats?: Record<string, number> }>('intent.graph.query', opts ?? {});
  }
  async graphStats(): Promise<Record<string, number>> {
    return this.rpc<Record<string, number>>('intent.graph.stats', {});
  }
  async history(userAddress: string): Promise<Record<string, unknown>> {
    return this.rpc<Record<string, unknown>>('intent.history', { userAddress });
  }
}

// Default export for convenience.
export default InfrixClient;
