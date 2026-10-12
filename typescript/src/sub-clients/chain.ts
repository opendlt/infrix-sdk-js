import { SubClient } from './base';

/** The position of a page in a paginated answer. */
export interface PageInfo {
  offset: number;
  limit: number;
  total: number;
}

/** What GET /v4/blocks answers: block summaries, newest first. */
export interface BlockList {
  items: Array<Record<string, unknown>>;
  pagination: PageInfo;
}

/** What GET /v4/blocks/latest answers: the block at the chain head. */
export interface LatestBlock {
  height: number;
}

/**
 * What GET /v4/blocks/{height} answers. `transactions` is the list of the block's transactions for a
 * reader that asserts an audit purpose and their count for any other.
 */
export interface Block {
  height: number;
  transactions: Array<Record<string, unknown>> | number;
  txCount: number;
  unit: string;
}

/** What GET /v4/transactions answers. */
export interface TransactionList {
  items: Array<Record<string, unknown>>;
  pagination: PageInfo;
}

/** What GET /v4/transactions/{hash} answers. */
export interface Transaction {
  txHash: string;
  status: string;
  blockHeight: number;
  gasUsed: number;
  planId: string;
  timestamp: string;
}

/** What GET /v4/transactions/{hash}/status answers. */
export interface TransactionStatus {
  hash: string;
  status: string;
  blockHeight: number;
  gasUsed: number;
}

/**
 * BlockSubClient reads the node's blocks. A reader that does not assert an audit purpose sees
 * identity fields hashed and each block's transactions reduced to a count. None of the routes takes a
 * query parameter.
 */
export class BlockSubClient extends SubClient {
  /** Block summaries, newest first. */
  async list(): Promise<BlockList> {
    return this.rest<BlockList>('GET', '/v4/blocks');
  }

  /** The block at the chain head. */
  async latest(): Promise<LatestBlock> {
    return this.rest<LatestBlock>('GET', '/v4/blocks/latest');
  }

  /**
   * The block at one height.
   *
   * @param height - A non-negative integer; the node answers 400 to anything else, so it is refused
   *   here without a request.
   */
  async get(height: number): Promise<Block> {
    if (!Number.isInteger(height) || height < 0) {
      throw new Error('blocks.get: height must be a non-negative integer');
    }
    return this.rest<Block>('GET', `/v4/blocks/${height}`);
  }
}

/**
 * TransactionSubClient reads the node's transactions. A reader that does not assert an audit purpose
 * sees identity fields hashed. None of the routes takes a query parameter.
 */
export class TransactionSubClient extends SubClient {
  /** Transactions, as the node pages them. */
  async list(): Promise<TransactionList> {
    return this.rest<TransactionList>('GET', '/v4/transactions');
  }

  /** One transaction by hash. */
  async get(hash: string): Promise<Transaction> {
    requireHash('get', hash);
    return this.rest<Transaction>('GET', `/v4/transactions/${encodeURIComponent(hash)}`);
  }

  /** The status of one transaction by hash. */
  async status(hash: string): Promise<TransactionStatus> {
    requireHash('status', hash);
    return this.rest<TransactionStatus>('GET', `/v4/transactions/${encodeURIComponent(hash)}/status`);
  }
}

function requireHash(method: string, hash: string): void {
  if (typeof hash !== 'string' || hash.trim() === '') {
    throw new Error(`transactions.${method}: a transaction hash is required`);
  }
}
