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

/** What POST /v4/billing/preview is asked: the work (`facts`) and the proof expected (`verdictInputs`). */
export interface BillingPreviewInput {
  /** The work the outcome does; it sets the base IU. */
  facts?: {
    planSteps?: number;
    approverRounds?: number;
    evidenceSealed?: boolean;
    anchorSubmitted?: boolean;
    internalGas?: number;
    dataBytes?: number;
  };
  /** The proof the outcome reaches; it sets the assurance class (an unknown evidence level derives the lowest). */
  verdictInputs?: {
    evidenceLevel?: string;
    anchored?: boolean;
    l0Confirmed?: boolean;
    policyAllowed?: boolean;
    approvalThreshold?: number;
    approvalsGranted?: number;
    credentialVerified?: boolean;
    regulated?: boolean;
  };
  /** Network utilization to quote at (0.5 is half full); it sets the congestion surcharge. */
  utilization?: number;
  /** Unix start of the period to draw down (default: the start of the current month). */
  periodStartUnix?: number;
}

/** What POST /v4/billing/preview answers: a quote that nothing records. */
export interface BillingQuote {
  payer: string;
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

  /**
   * Price an outcome that has not happened (REST POST /v4/billing/preview). The quote uses the
   * caller's plan, stake and what they have drawn this period, exactly as a real charge would, and
   * records nothing. Only the fields the route accepts are sent; a field left out is left to the
   * node's default. The caller is the client's disclosure actor.
   */
  async preview(input: BillingPreviewInput = {}): Promise<BillingQuote> {
    const { facts, verdictInputs, utilization, periodStartUnix } = input;
    if (utilization !== undefined && (!Number.isFinite(utilization) || utilization < 0)) {
      throw new Error('preview: utilization must be a non-negative number');
    }
    if (periodStartUnix !== undefined && (!Number.isInteger(periodStartUnix) || periodStartUnix < 0)) {
      throw new Error('preview: periodStartUnix must be a non-negative unix timestamp');
    }
    return this.rest<BillingQuote>('POST', '/v4/billing/preview', { facts, verdictInputs, utilization, periodStartUnix });
  }

  /** The billing entry for one intent. */
  async forIntent(intentId: string): Promise<IntentBillingEntry> {
    return this.rest<IntentBillingEntry>('GET', `/v4/intents/${encodeURIComponent(intentId)}/billing`);
  }
}
