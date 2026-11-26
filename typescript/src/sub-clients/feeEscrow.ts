import { SubClient } from './base';
import { declaredMembers } from './routeShapes';

const FUND_ROUTE = 'POST /v4/fee-escrow/fund';
const WITHDRAW_ROUTE = 'POST /v4/fee-escrow/withdraw';
const BALANCE_ROUTE = 'POST /v4/fee-escrow/balance';
const RECONCILE_ROUTE = 'POST /v4/fee-escrow/reconcile';

/** Every fee escrow route's answer members (the door's answer and what the façade adds). */
const ANSWER_MEMBERS: ReadonlyArray<keyof FeeEscrowAnswer> = ['action', 'balance', 'entry', 'governed', 'intentId', 'payer', 'reconciliation'];

/** A payer's fee escrow position, in ACME base units (gas.FeeEscrowBalance). */
export interface FeeEscrowBalance {
  payer: string;
  /** The token account the first deposit came from: the only account a withdrawal pays. */
  fundingAccount?: string;
  deposited: number;
  reserved: number;
  debited: number;
  withdrawn: number;
  /** What the payer can still reserve or withdraw. */
  available: number;
}

/** One entry the act wrote (gas.FeeEscrowEntry): a deposit, a debit or a withdrawal. */
export interface FeeEscrowEntry {
  id: string;
  kind: string;
  payer: string;
  amount: number;
  /** The L0 transaction the entry is backed by. */
  l0TxId: string;
  /** The governed act that wrote it. */
  intentId: string;
  /** The account a deposit came from or a withdrawal paid. */
  account?: string;
  [member: string]: unknown;
}

/** The escrow account's L0 balance and purchases checked against the entries (gas.FeeEscrowReconciliation). */
export interface FeeEscrowReconciliation {
  escrowAccount: string;
  reconciled: boolean;
  l0Balance: number;
  /** deposited - debited - withdrawn: what the L0 balance must equal. */
  expected: number;
  purchasesChecked: number;
  [member: string]: unknown;
}

/** What every fee escrow route answers: the governed act's intent and the door's answer. */
export interface FeeEscrowAnswer {
  action: 'fund' | 'withdraw' | 'balance' | 'reconcile';
  payer: string;
  balance: FeeEscrowBalance;
  /** The entry the act wrote (fund, withdraw); null for balance and reconcile. */
  entry: FeeEscrowEntry | null;
  /** The reconciliation (reconcile); null for the other acts. */
  reconciliation: FeeEscrowReconciliation | null;
  /** The governed SUBSYSTEM_ACTION fee_escrow.<action> intent the route submitted. */
  intentId: string;
  governed: true;
}

function requireActor(op: string, actor: string): void {
  if (typeof actor !== 'string' || actor.trim() === '') {
    throw new Error(`feeEscrow.${op}: actor is required: the payer whose fee escrow the act moves or reads`);
  }
}

/**
 * FeeEscrowSubClient drives the node's fee escrow (2c-28be R1): the payer pre-funds destination fees with its own signed L0 ACME
 * transfer, and the node pays each cross-chain dispatch's actual fee from it. Every method submits the governed
 * SUBSYSTEM_ACTION fee_escrow.<action> through REST POST /v4/fee-escrow/<action> (JSON-RPC feeEscrow.<action> is the same door) and
 * answers the door's answer with the act's intent id: nothing here reads or moves the escrow outside a governed act.
 */
export class FeeEscrowSubClient extends SubClient {
  /**
   * Record a deposit (REST POST /v4/fee-escrow/fund). The node reads the SendTokens back from L0: it must be delivered, sent from
   * `from` (a token account of the actor's identity) and credit the escrow. The first deposit fixes the payer's funding account; a
   * second fund of the same transfer is refused by name.
   *
   * @param input.l0TxHash - the transfer's 32-byte hash in hex, or its transaction id `acc://<hash>@<principal>`.
   */
  async fund(input: { actor: string; l0TxHash: string; from: string }): Promise<FeeEscrowAnswer> {
    requireActor('fund', input.actor);
    if (!input.l0TxHash || !input.from) {
      throw new Error('feeEscrow.fund: l0TxHash and from are required: the SendTokens the payer signed to the escrow, and the token account it came from');
    }
    const answer = await this.rest<unknown>('POST', '/v4/fee-escrow/fund', { actor: input.actor, l0TxHash: input.l0TxHash, from: input.from });
    return declaredMembers<FeeEscrowAnswer>(FUND_ROUTE, answer, ANSWER_MEMBERS);
  }

  /**
   * Withdraw unreserved ACME to the funding account (REST POST /v4/fee-escrow/withdraw). With no amount, all of it; more than the
   * unreserved balance is refused by name.
   */
  async withdraw(input: { actor: string; amount?: number }): Promise<FeeEscrowAnswer> {
    requireActor('withdraw', input.actor);
    if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || input.amount < 0)) {
      throw new Error('feeEscrow.withdraw: amount must be a non-negative whole number of ACME base units');
    }
    // an absent amount is left out of the body (JSON drops undefined): the whole unreserved balance
    const answer = await this.rest<unknown>('POST', '/v4/fee-escrow/withdraw', { actor: input.actor, amount: input.amount });
    return declaredMembers<FeeEscrowAnswer>(WITHDRAW_ROUTE, answer, ANSWER_MEMBERS);
  }

  /** The payer's escrow position, read inside a governed act (REST POST /v4/fee-escrow/balance). */
  async balance(input: { actor: string }): Promise<FeeEscrowAnswer> {
    requireActor('balance', input.actor);
    const answer = await this.rest<unknown>('POST', '/v4/fee-escrow/balance', { actor: input.actor });
    return declaredMembers<FeeEscrowAnswer>(BALANCE_ROUTE, answer, ANSWER_MEMBERS);
  }

  /**
   * Check the escrow account's L0 balance and every purchase against the entries (REST POST /v4/fee-escrow/reconcile); refused by
   * name when they differ.
   */
  async reconcile(input: { actor: string }): Promise<FeeEscrowAnswer> {
    requireActor('reconcile', input.actor);
    const answer = await this.rest<unknown>('POST', '/v4/fee-escrow/reconcile', { actor: input.actor });
    return declaredMembers<FeeEscrowAnswer>(RECONCILE_ROUTE, answer, ANSWER_MEMBERS);
  }
}
