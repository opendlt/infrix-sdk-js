/**
 * Signature explanation (nextux-08).
 *
 * A faithful port of pkg/identityux.ExplainSignature: it answers "what will this
 * signature do?" in plain language, and fails closed on a request it cannot
 * explain — so a signature prompt is never blank. The cross-language fixture
 * test asserts this matches the Go output byte-for-byte on the key fields.
 */

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

const VALUE_MOVING_GOALS = new Set([
  'SEND_TOKENS', 'ADD_CREDITS', 'CONVERT', 'SWAP', 'STAKE', 'BRIDGE',
  'BORROW', 'PROVIDE_LIQUIDITY', 'EARN_YIELD', 'COMPOUND',
]);

function rootIdentity(keyPageURL: string): string {
  const m = /^(acc:\/\/[^/]+)/.exec(keyPageURL || '');
  return m ? m[1] : keyPageURL || '';
}

function humanGoal(goal: string, custom?: string): string {
  const map: Record<string, string> = {
    SEND_TOKENS: 'Send tokens', ADD_CREDITS: 'Add credits', WRITE_DATA: 'Write data',
    CONTRACT_CALL: 'Call a contract', CONTRACT_DEPLOY: 'Deploy a contract',
    OBJECT_CREATE: 'Create a governed object', OBJECT_MUTATE: 'Change a governed object',
    SWAP: 'Swap assets',
  };
  const up = (goal || '').toUpperCase();
  if (map[up]) return map[up];
  if (up === 'CUSTOM') return custom ? `Custom: ${custom}` : 'Custom operation';
  const label = (goal || '').toLowerCase().replace(/_/g, ' ');
  return label ? label[0].toUpperCase() + label.slice(1) : 'Operation';
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
  if (!(req.signer || '').trim()) throw new SignatureUnexplainableError('cannot explain a signature with no signer key page');
  const network = (req.network || '').trim();
  if (!network) throw new SignatureUnexplainableError('cannot explain a signature with no network');

  const source = req.sourceAssets ?? [];
  const target = req.targetAssets ?? [];
  const movesFunds = source.length > 0 || target.length > 0 || VALUE_MOVING_GOALS.has(goal.toUpperCase());
  const dataDisclosed = !!req.disclosesData
    || goal.toUpperCase() === 'WRITE_DATA'
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

  const action = (req.action || '').trim() || humanGoal(goal, req.customType);
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
