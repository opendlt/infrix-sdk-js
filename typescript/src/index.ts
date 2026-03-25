/**
 * @infrix/client — TypeScript client for the Infrix smart contract platform.
 *
 * Usage:
 *   import { InfrixClient } from '@infrix/client';
 *   const client = new InfrixClient('http://localhost:8080');
 *   const receipt = await client.deploy('acc://my.acme/counter', wasmHex);
 *   const result = await client.call('acc://my.acme/counter', 'increment');
 */

// ---- Types ----

export interface DeployResult {
  txHash: string;
  contractUrl: string;
  blockHeight: number;
  codeHash: string;
}

export interface CallResult {
  txHash: string;
  returnData: string | string[] | null;
  gasUsed: number;
  blockHeight: number;
}

export interface QueryResult {
  returnData: string | string[] | null;
}

export interface TransactionReceipt {
  txHash: string;
  status: 'success' | 'failed';
  gasUsed: number;
  blockHeight: number;
  contractUrl: string;
  function: string;
  error: string;
  returnData: string;
  timestamp: string;
}

export interface ContractInfo {
  url: string;
  codeHash: string;
  codeSize: number;
  deployedAt: string;
  callCount: number;
  totalGasUsed: number;
  functions: string[];
  version: number;
}

export interface UpgradeResult {
  txHash: string;
  contractUrl: string;
  blockHeight: number;
  newCodeHash: string;
  version: number;
}

export interface TraceStep {
  op: string;
  detail: string;
  gasCost: number;
}

export interface TraceResult {
  txHash: string;
  type: string;
  contractUrl: string;
  function: string;
  args: string[];
  result: string[];
  gasUsed: number;
  blockHeight: number;
  status: string;
  error: string;
  durationMs: number;
  steps: TraceStep[];
  timestamp: string;
}

export interface ExplorerStatus {
  blockHeight: number;
  contractCount: number;
  transactionCount: number;
  uptimeSeconds: number;
}

export interface IndexedEvent {
  blockHeight: number;
  txHash: string;
  logIndex: number;
  contractUrl: string;
  eventName: string;
  topics: string[];
  data: string;
  timestamp: string;
}

export interface EventFilterParams {
  contractUrl?: string;
  eventName?: string;
  topics?: string[];
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  offset?: number;
}

export interface ReceiptFilterParams {
  contractUrl?: string;
  function?: string;
  status?: string;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
  offset?: number;
}

export interface StateDiffFilterParams {
  contractUrl?: string;
  storageKey?: string;
  fromBlock?: number;
  toBlock?: number;
  limit?: number;
}

export interface IndexedStateDiff {
  blockHeight: number;
  txHash: string;
  contractUrl: string;
  storageKey: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
}

export interface ContractStatsResult {
  url: string;
  callCount: number;
  totalGasUsed: number;
  eventCount: number;
  firstBlock: number;
  latestBlock: number;
  uniqueCallers: number;
  successCount: number;
  failureCount: number;
  functionCounts: Record<string, number>;
}

export interface NetworkStatsResult {
  totalContracts: number;
  totalTransactions: number;
  totalEvents: number;
  totalBlocks: number;
  totalGasUsed: number;
  avgGasPerTx: number;
}

// ---- Contract Schema Types ----

export interface ContractSchema {
  schema_version: number;
  name: string;
  version?: string;
  description?: string;
  functions: FunctionSchemaEntry[];
  events?: EventSchemaEntry[];
  errors?: ErrorSchemaEntry[];
}

export interface FunctionSchemaEntry {
  name: string;
  mutability: 'mutable' | 'view' | 'init' | 'payable';
  params: ParamSchemaEntry[];
  returns: ParamSchemaEntry[];
  doc?: string;
}

export interface ParamSchemaEntry {
  name: string;
  type: string;
}

export interface EventSchemaEntry {
  name: string;
  fields: FieldSchemaEntry[];
}

export interface FieldSchemaEntry {
  name: string;
  type: string;
  indexed: boolean;
}

export interface ErrorSchemaEntry {
  name: string;
  code: number;
  message: string;
}

export interface BatchCallRequest {
  url: string;
  function: string;
  args?: unknown[];
  gasLimit?: number;
}

export interface BatchCallResult {
  url: string;
  function: string;
  txHash: string;
  returnData: string | string[] | null;
  gasUsed: number;
  blockHeight: number;
  status: string;
  error: string;
}

export interface DevnetEvent {
  type: string;
  blockHeight: number;
  timestamp: string;
  data: Record<string, unknown>;
}

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

  /**
   * Create a client connected to an Infrix devnet.
   * @param baseUrl The base URL of the devnet server, e.g. "http://localhost:8080"
   */
  constructor(baseUrl: string) {
    const base = baseUrl.replace(/\/+$/, '');
    this.rpcUrl = `${base}/rpc`;
    this.wsUrl = base.replace(/^http/, 'ws') + '/ws';
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

  // ---- Contract Lifecycle ----

  /** Deploy a contract from hex-encoded WASM bytecode. */
  async deploy(url: string, bytecodeHex: string, gasLimit = 500000): Promise<DeployResult> {
    return this.rpc<DeployResult>('contract.deploy', { url, bytecode: bytecodeHex, gasLimit });
  }

  /** Execute a state-changing function on a deployed contract. */
  async call(url: string, fn: string, args: unknown[] = [], gasLimit = 500000): Promise<CallResult> {
    return this.rpc<CallResult>('contract.call', { url, function: fn, args, gasLimit });
  }

  /** Execute a read-only query against a deployed contract. */
  async query(url: string, fn: string, args: unknown[] = [], gasLimit = 500000): Promise<QueryResult> {
    return this.rpc<QueryResult>('contract.query', { url, function: fn, args, gasLimit });
  }

  /** Upgrade a contract's bytecode while preserving state. */
  async upgrade(url: string, bytecodeHex: string): Promise<UpgradeResult> {
    return this.rpc<UpgradeResult>('contract.upgrade', { url, bytecode: bytecodeHex });
  }

  /** Get contract metadata and exported functions. */
  async inspect(url: string): Promise<ContractInfo> {
    return this.rpc<ContractInfo>('contract.inspect', { url });
  }

  // ---- Transaction History ----

  /** Retrieve a transaction receipt by hash. */
  async getTransaction(txHash: string): Promise<TransactionReceipt> {
    return this.rpc<TransactionReceipt>('tx.get', { txHash });
  }

  /** Retrieve a detailed execution trace for a transaction. */
  async getTrace(txHash: string): Promise<TraceResult> {
    return this.rpc<TraceResult>('tx.trace', { txHash });
  }

  // ---- Batch Execution ----

  /** Execute multiple contract calls in parallel (different contracts run concurrently). */
  async callBatch(calls: BatchCallRequest[]): Promise<BatchCallResult[]> {
    const normalized = calls.map(c => ({
      url: c.url,
      function: c.function,
      args: c.args ?? [],
      gasLimit: c.gasLimit ?? 500000,
    }));
    const result = await this.rpc<{ results: BatchCallResult[] }>('contract.callBatch', { calls: normalized });
    return result.results;
  }

  // ---- Index Queries ----

  /** Query indexed events with filtering. */
  async queryEvents(filter: EventFilterParams = {}): Promise<{ events: IndexedEvent[]; total: number }> {
    return this.rpc<{ events: IndexedEvent[]; total: number }>('index.getEvents', filter as Record<string, unknown>);
  }

  /** Query indexed events by transaction hash. */
  async queryEventsByTx(txHash: string): Promise<IndexedEvent[]> {
    const result = await this.rpc<{ events: IndexedEvent[] }>('index.getEventsByTx', { txHash });
    return result.events;
  }

  /** Query indexed receipts with filtering. */
  async queryReceipts(filter: ReceiptFilterParams = {}): Promise<{ receipts: TransactionReceipt[]; total: number }> {
    return this.rpc<{ receipts: TransactionReceipt[]; total: number }>('index.getReceipts', filter as Record<string, unknown>);
  }

  /** Query indexed state diffs with filtering. */
  async queryStateDiffs(filter: StateDiffFilterParams = {}): Promise<{ diffs: IndexedStateDiff[] }> {
    return this.rpc<{ diffs: IndexedStateDiff[] }>('index.getStateDiffs', filter as Record<string, unknown>);
  }

  /** Get aggregate statistics for a specific contract. */
  async getContractStats(contractUrl: string): Promise<ContractStatsResult> {
    return this.rpc<ContractStatsResult>('index.getContractStats', { contractUrl });
  }

  /** Get aggregate network statistics. */
  async getNetworkStats(): Promise<NetworkStatsResult> {
    return this.rpc<NetworkStatsResult>('index.getNetworkStats');
  }

  // ---- Explorer ----

  /** Get devnet status (block height, counts, uptime). */
  async status(): Promise<ExplorerStatus> {
    return this.rpc<ExplorerStatus>('explorer.status');
  }

  /** List all deployed contracts. */
  async listContracts(): Promise<ContractInfo[]> {
    const result = await this.rpc<{ contracts: ContractInfo[] }>('explorer.contracts');
    return result.contracts;
  }

  /** List recent transactions. */
  async listTransactions(): Promise<TransactionReceipt[]> {
    const result = await this.rpc<{ transactions: TransactionReceipt[] }>('explorer.transactions');
    return result.transactions;
  }

  /** Get event history, optionally filtered by type. */
  async eventHistory(eventType?: string): Promise<DevnetEvent[]> {
    const result = await this.rpc<{ events: DevnetEvent[] }>('events.history', { eventType: eventType ?? '' });
    return result.events;
  }

  // ---- Schema & Runtime Binding ----

  /** Fetch the embedded schema for a deployed contract. */
  async getSchema(url: string): Promise<ContractSchema | null> {
    const result = await this.rpc<{ schema: ContractSchema | null }>('contract.schema', { url });
    return result.schema;
  }

  /**
   * Create a runtime binding for a deployed contract using its embedded schema.
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

// Default export for convenience.
export default InfrixClient;
