import { SubClient } from './base';

/** What GET /v4/billing/consumption answers. */
export interface BillingConsumption {
  payer: string;
  /** Unix start of the period the total covers. */
  periodStartUnix: number;
  /** The metered IU the payer has been charged since that start. */
  consumedIU: number;
}

/** What GET /v4/intents/{id}/billing answers: the IU entry for one intent. */
export interface IntentBillingEntry {
  intentId: string;
  actor: string;
  payer: string;
  planId: string;
  planName: string;
  assuranceClass: string;
  assuranceMultiplier: number;
  baseIU: number;
  meteredIU: number;
  includedDrawn: number;
  overageIU: number;
  congestionMultiplier: number;
  utilization: number;
  stakingTier: number;
  stakingDiscount: number;
  usdCharged: number;
  evidenceBundleId: string;
  blockHeight: number;
  timestampUnix: number;
}

/**
 * BillingSubClient reads what the calling actor has been billed. Both reads are about the caller
 * only: there is no override that reads another payer's total.
 */
export class BillingSubClient extends SubClient {
  /**
   * The IU the caller has been charged as payer in a period.
   *
   * @param opts.periodStart - Unix start of the period (default: the start of the current month).
   *   The node refuses a value that is not a non-negative integer.
   */
  async consumption(opts: { periodStart?: number } = {}): Promise<BillingConsumption> {
    const start = opts.periodStart;
    if (start !== undefined && (!Number.isInteger(start) || start < 0)) {
      throw new Error('consumption: periodStart must be a non-negative unix timestamp');
    }
    const query = start === undefined ? '' : `?periodStart=${start}`;
    return this.rest<BillingConsumption>('GET', `/v4/billing/consumption${query}`);
  }

  /** The billing entry for one intent. */
  async forIntent(intentId: string): Promise<IntentBillingEntry> {
    return this.rest<IntentBillingEntry>('GET', `/v4/intents/${encodeURIComponent(intentId)}/billing`);
  }
}
