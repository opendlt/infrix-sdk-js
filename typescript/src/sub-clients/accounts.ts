import { SubClient } from './base';
import type { PageInfo } from './chain';

/** What GET /v4/accounts answers: the node's projection of each account, as it pages them. */
export interface AccountList {
  items: Array<Record<string, unknown>>;
  pagination: PageInfo;
}

/**
 * What GET /v4/accounts/{url} answers. These three keys are the ones every kind of account carries; an
 * ADI also answers its authority and type, and a token account its balance and token URL.
 * `recognised` is false for an account that exists on L0 but that this node grants no authority.
 */
export interface Account {
  l0Type: string;
  recognised: boolean;
  url: string;
}

/**
 * What GET /v4/accounts/{url}/balance answers. `balances` is one entry per token account on a node that
 * reads L0 (an ADI holds nothing itself, so it lists the accounts beneath it) and a map from asset to
 * amount on a node that does not model them; either may be empty.
 */
export interface AccountBalance {
  balances: Array<Record<string, unknown>> | Record<string, string>;
  l0Type: string;
  url: string;
}

/**
 * AccountSubClient reads the node's view of Accumulate accounts. The only query parameter any of the
 * routes accepts is `parentAdi` on the list.
 */
export class AccountSubClient extends SubClient {
  /**
   * The accounts the node knows.
   *
   * @param opts.parentAdi - List only the accounts under this ADI. A blank value is refused here
   *   rather than sent, because the node reads it as no filter.
   */
  async list(opts: { parentAdi?: string } = {}): Promise<AccountList> {
    const parent = opts.parentAdi;
    if (parent === undefined) {
      return this.rest<AccountList>('GET', '/v4/accounts');
    }
    if (typeof parent !== 'string' || parent.trim() === '') {
      throw new Error('accounts.list: parentAdi must be an ADI URL (for example acc://alice.acme)');
    }
    return this.rest<AccountList>('GET', `/v4/accounts?parentAdi=${encodeURIComponent(parent.trim())}`);
  }

  /** One account by URL (for example `acc://alice.acme/tokens`). */
  async get(url: string): Promise<Account> {
    const target = requireAccountUrl('get', url);
    return this.rest<Account>('GET', `/v4/accounts/${encodeURIComponent(target)}`);
  }

  /** What one account holds, read from L0. */
  async balance(url: string): Promise<AccountBalance> {
    const target = requireAccountUrl('balance', url);
    return this.rest<AccountBalance>('GET', `/v4/accounts/${encodeURIComponent(target)}/balance`);
  }
}

function requireAccountUrl(method: string, url: string): string {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error(`accounts.${method}: an account URL is required (for example acc://alice.acme/tokens)`);
  }
  return url.trim();
}
