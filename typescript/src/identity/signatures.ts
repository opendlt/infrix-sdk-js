/**
 * Signature explanation (nextux-08).
 *
 * A faithful port of pkg/identityux.ExplainSignature: it answers "what will this
 * signature do?" in plain language, and fails closed on a request it cannot
 * explain — so a signature prompt is never blank. The cross-language fixture
 * test asserts this matches the Go output byte-for-byte on the key fields.
 */

import { isIntentGoalType } from '../types/governance';

export interface AssetAmount {
  asset?: string;
  amount?: number;
  amountDecimal?: string;
  contractUrl?: string;
}

export interface SignatureRequest {
  action?: string;
  goalType: string;
  customType?: string;
  customParams?: Record<string, unknown>;
  sourceAssets?: AssetAmount[];
  targetAssets?: AssetAmount[];
  signer: string;
  signerVersion?: number;
  network: string;
  memo?: string;
  agentInitiated?: boolean;
  requestedBy?: string;
  disclosesData?: boolean;
}

export interface Explanation {
  action: string;
  network: string;
  identityTouched: string;
  requiredKeyPage: string;
  fundsOrCreditsMove: boolean;
  movesDetail?: string;
  dataDisclosed: boolean;
  agentInitiated: boolean;
  expectedProof: string;
  irreversibleEffects: string[];
  warnings: string[];
  plain: string;
}

// The node's goal types that move value even without explicit assets. A plain
// token transfer and an ACME-to-credits purchase are NOT separate goals: the
// standalone transfer goal was removed (Gap 13), and single-leg value movement of
// every kind — a direct transfer, an escrow, a credit issue, transfer or burn —
// is a SETTLEMENT whose legs say what moves. SEND_TOKENS and ADD_CREDITS were
// names this port carried that the node refuses (the Go explainer's own list
// named them too, until it was corrected).
const VALUE_MOVING_GOALS = new Set<string>([
  'SETTLEMENT', 'SETTLEMENT_NETTING', 'CONVERT', 'SWAP', 'STAKE', 'BRIDGE',
  'BRIDGE_SEND', 'BRIDGE_RECEIVE', 'BORROW', 'PROVIDE_LIQUIDITY', 'EARN_YIELD',
  'COMPOUND',
]);

// Goals that put caller-supplied data into the governed record, and goals whose
// purpose is to open data to a reader. WRITE_DATA — the name this port used — is
// not a goal: a data-account write is an object create or mutate.
const DATA_RECORDING_GOALS = new Set<string>(['OBJECT_CREATE', 'OBJECT_MUTATE']);
const DISCLOSING_GOALS = new Set<string>(['DISCLOSURE_GRANT', 'DISCLOSURE_APPROVE', 'DISCLOSURE_REGISTER_KEY']);

// What one kind of settlement leg does, in plain words (pkg/objects LegKind).
const SETTLEMENT_LEG_ACTION: Record<string, string> = {
  direct: 'Send tokens',
  credit_issue: 'Add credits',
  credit_transfer: 'Transfer credits',
  credit_burn: 'Burn credits',
  escrow: 'Escrow funds',
  bridge: 'Bridge tokens',
  netting_net: 'Settle netted balances',
};

/** The kind of every leg of a settlement request, in leg order. A leg that is not
 *  an object, or names no kind, contributes the empty kind. */
function settlementLegKinds(params: Record<string, unknown> | undefined): string[] {
  const legs = params?.legs;
  if (!Array.isArray(legs)) return [];
  return legs.map((l) => {
    const kind = l && typeof l === 'object' ? (l as Record<string, unknown>).kind : undefined;
    return typeof kind === 'string' ? kind : '';
  });
}

/** settlementAction says what a SETTLEMENT does by what its legs do (mirrors
 *  pkg/identityux settlementAction). */
function settlementAction(params: Record<string, unknown> | undefined): string {
  const kinds = settlementLegKinds(params);
  if (kinds.length === 0) return 'Settle value';
  if (kinds.some((k) => k !== kinds[0])) return `Settle value (${kinds.length} legs of mixed kinds)`;
  return SETTLEMENT_LEG_ACTION[kinds[0]] ?? 'Settle value';
}

function rootIdentity(keyPageURL: string): string {
  const m = /^(acc:\/\/[^/]+)/.exec(keyPageURL || '');
  return m ? m[1] : keyPageURL || '';
}

function humanGoal(goal: string, req: SignatureRequest): string {
  if (goal === 'SETTLEMENT') return settlementAction(req.customParams);
  const map: Record<string, string> = {
    CONTRACT_CALL: 'Call a contract', CONTRACT_DEPLOY: 'Deploy a contract',
    OBJECT_CREATE: 'Create a governed object', OBJECT_MUTATE: 'Change a governed object',
    SWAP: 'Swap assets',
  };
  if (map[goal]) return map[goal];
  if (goal === 'CUSTOM') return req.customType ? `Custom: ${req.customType}` : 'Custom operation';
  const label = goal.toLowerCase().replace(/_/g, ' ');
  return (label ? label[0].toUpperCase() + label.slice(1) : 'Operation') + (req.customType ? ` (${req.customType})` : '');
}

function expectedProof(network: string): string {
  const n = (network || '').toLowerCase();
  if (n === 'local' || n === '') return 'L3 offline proof (no L0 anchor)';
  if (n === 'mainnet') return 'L4 mainnet-anchored proof';
  return `L4 proof anchored to ${network}`;
}

function assetSummary(assets: AssetAmount[]): string {
  return assets
    .map((a) => {
      const amt = a.amountDecimal || String(a.amount ?? 0);
      const asset = a.asset || a.contractUrl || '';
      return `${amt} ${asset}`.trim();
    })
    .join(', ');
}

export class SignatureUnexplainableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureUnexplainableError';
  }
}

/** explainSignature mirrors pkg/identityux.ExplainSignature. It throws a
 *  SignatureUnexplainableError for a request it cannot explain (invariant 2). */
export function explainSignature(req: SignatureRequest): Explanation {
  const goal = (req.goalType || '').trim();
  if (!goal) throw new SignatureUnexplainableError('cannot explain a signature with no goalType');
  // A signature prompt for a request the node would refuse is not an explanation,
  // it is a description of something that cannot happen — and the goal type is
  // part of what the user signs. The match is exact: the node's goal strings are
  // canonical, and "settlement" would be signed as typed and then refused.
  if (!isIntentGoalType(goal)) {
    throw new SignatureUnexplainableError(
      `${JSON.stringify(goal)} is not a goal type the node accepts, so there is nothing to explain — ` +
        'a value transfer or credit purchase is SETTLEMENT (its legs say which), a data write is OBJECT_CREATE or OBJECT_MUTATE',
    );
  }
  if (!(req.signer || '').trim()) throw new SignatureUnexplainableError('cannot explain a signature with no signer key page');
  const network = (req.network || '').trim();
  if (!network) throw new SignatureUnexplainableError('cannot explain a signature with no network');

  const source = req.sourceAssets ?? [];
  const target = req.targetAssets ?? [];
  const movesFunds = source.length > 0 || target.length > 0 || VALUE_MOVING_GOALS.has(goal);
  const dataDisclosed = !!req.disclosesData
    || DATA_RECORDING_GOALS.has(goal)
    || DISCLOSING_GOALS.has(goal)
    || Object.keys(req.customParams ?? {}).some((k) => k.toLowerCase().includes('disclos'));

  let movesDetail: string | undefined;
  if (movesFunds) {
    const parts: string[] = [];
    const s = assetSummary(source);
    const t = assetSummary(target);
    if (s) parts.push(`out: ${s}`);
    if (t) parts.push(`in: ${t}`);
    movesDetail = parts.length ? parts.join('; ') : 'this operation can move value';
  }

  const irreversible: string[] = [];
  if (network.toLowerCase() !== 'local') irreversible.push(`writes a real transaction to ${network} (cannot be un-written)`);
  if (movesFunds) irreversible.push('moves value — once anchored it cannot be reversed');
  if (irreversible.length === 0) irreversible.push('none — this produces an offline proof and writes no network state');

  const warnings: string[] = [];
  if (network.toLowerCase() === 'mainnet') warnings.push('this signs a MAINNET transaction — funds are real');
  if (req.agentInitiated) warnings.push('an AI agent initiated this request — confirm you intended it');
  if (movesFunds && network.toLowerCase() !== 'local') warnings.push('this moves funds/credits on a live network');

  const action = (req.action || '').trim() || humanGoal(goal, req);
  const identityTouched = rootIdentity(req.signer);
  const requiredKeyPage = req.signer + (req.signerVersion ? ` (version ${req.signerVersion})` : '');

  let plain = `You are about to sign: ${action} on ${network}.\n`;
  plain += `It acts as ${identityTouched} using key page ${requiredKeyPage}.\n`;
  plain += movesFunds ? `It MOVES funds/credits (${movesDetail}).\n` : 'It does not move funds or credits.\n';
  if (dataDisclosed) plain += 'It discloses data.\n';
  if (req.agentInitiated) plain += 'An AI agent initiated this request.\n';
  plain += `Expected proof: ${expectedProof(network)}.\n`;
  plain += `Irreversible effects: ${irreversible.join('; ')}.`;

  return {
    action,
    network,
    identityTouched,
    requiredKeyPage,
    fundsOrCreditsMove: movesFunds,
    movesDetail,
    dataDisclosed,
    agentInitiated: !!req.agentInitiated,
    expectedProof: expectedProof(network),
    irreversibleEffects: irreversible,
    warnings,
    plain,
  };
}
