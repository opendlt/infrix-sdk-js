/**
 * Contract inspection and read-only simulation types. State-changing
 * contract operations (deploy, call, upgrade) are governance-routed as
 * intents; their results are `IntentResult` values from the governance
 * types module, not raw contract receipts.
 */

/**
 * Result of a read-only simulation. `txHash` and `blockHeight` are
 * provided only when the simulation is pinned to a specific block for
 * determinism; simulations do not mutate state and do not produce
 * anchored receipts.
 */
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

export interface DevnetEvent {
  type: string;
  blockHeight: number;
  timestamp: string;
  data: Record<string, unknown>;
}
