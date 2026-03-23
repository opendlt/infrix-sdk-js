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
}

// Default export for convenience.
export default InfrixClient;
