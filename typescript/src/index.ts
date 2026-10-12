/**
 * @infrix/client — Policy-governed execution and evidence layer for Accumulate.
 *
 * All operations flow through the canonical governance spine:
 *   Intent -> Plan -> Approval -> Execution -> Outcome -> Evidence -> Anchor
 *
 * Primary sub-clients (governance spine):
 *   client.intents.*       — Submit governed operations
 *   client.policies.*      — Evaluate governance policies
 *   client.approvals.*     — Manage approval workflows
 *   client.evidence.*      — Inspect evidence chains
 *   client.trust.*         — Manage external dependency trust
 *   client.anchors.*       — Verify L0 anchor proofs
 *
 * Secondary sub-clients (protocol primitives):
 *   client.objects.*       — Governed object operations
 *   client.roles.*         — Role binding management
 *   client.capabilities.*  — Capability grant management
 *   client.settlements.*   — Settlement instructions
 *   client.escrows.*       — Escrow management
 *   client.disclosures.*   — Disclosure grant management
 *
 * Contract inspection (read-only only):
 *   client.contracts.*     — query, simulate, inspect, schema
 *   Contract mutations (deploy/call/upgrade) must be submitted as intents
 *   via client.intents.submit({ type: 'CONTRACT_DEPLOY' | 'CONTRACT_CALL' |
 *   'CONTRACT_UPGRADE', ... }).
 *
 * @example
 *   import { InfrixClient } from '@infrix/client';
 *   // Connect by network name ('kermit' | 'testnet' | 'local') or a full URL,
 *   // and set the disclosure context up front (the node rejects governed calls
 *   // without an actor + purpose).
 *   const client = new InfrixClient('kermit', {
 *     actor: 'acc://alice.acme',
 *     purpose: 'demo',
 *   });
 *
 *   // Governance-first: submit a CONTRACT_CALL intent
 *   const result = await client.intents.submit({
 *     type: 'CONTRACT_CALL',
 *     customParams: {
 *       contract: 'acc://mytoken.acme',
 *       function: 'transfer',
 *       args: JSON.stringify(['acc://bob.acme/tokens', '100']),
 *     },
 *   });
 */

// ---- Re-export types ----

export type {
  CallResult,
  QueryResult,
  TransactionReceipt,
  ContractInfo,
  TraceStep,
  TraceResult,
  ExplorerStatus,
  IndexedEvent,
  EventFilterParams,
  ReceiptFilterParams,
  StateDiffFilterParams,
  IndexedStateDiff,
  ContractStatsResult,
  NetworkStatsResult,
  ContractSchema,
  FunctionSchemaEntry,
  ParamSchemaEntry,
  EventSchemaEntry,
  FieldSchemaEntry,
  ErrorSchemaEntry,
  DevnetEvent,
} from './types/contract';

export * from './types/governance';
export * from './types/verifiers';

export { withGovernanceSugar, waitForCompletion, InfrixGovernanceError } from './sugar';
export type { GovernedResult, GovernedOptions } from './sugar';

// Priority 02: the shared governed-result normalizer — every composite helper
// hydrates real spine artifacts through this, never blank/fake/partial state.
export {
  normalizeSubmittedIntent,
  waitForGovernedResult,
  hydrateGovernedResult,
  hydrateOutcomeArtifacts,
  assertCompleteGovernedResult,
  IncompleteGovernedResultError,
} from './results';
export type {
  ResultCompletenessOptions,
  SubmittedLike,
  ApprovalSummary,
  AssuranceSummary,
} from './results';

export { withGoldenApp } from './golden/escrow';
export type {
  EscrowCreateParams,
  EscrowHandle,
  EscrowReleaseParams,
  PortableProof,
} from './golden/escrow';

// platform-review-3 Epic 7: high-level developer flows + local proof
// verification + create-infrix-app templates.
export { withProofs, withReadiness, withWitnesses, withHostedDevnet } from './flows';
export type {
  SubstrateRow,
  ReadinessReport,
  WitnessReceipt,
  WitnessEvaluation,
  WitnessQuorumResult,
  WitnessQuorumOptions,
  CliVerifyResult,
  HostedDevnet,
} from './flows';
export { verifyLocalProof, hasReplayCapsule } from './proofs/verifyLocal';
export type { VerifyRequire, ProofVerifyResult } from './proofs/verifyLocal';

// Priority 01: consumer-grade MetaMask -> Accumulate governed-intent path
// (recovers the secp256k1 public key; no manual publicKey input).
export { withMetaMask, MetaMaskApi } from './metamask';
export type { MetaMaskGoal, MetaMaskSubmitParams, MetaMaskGovernedResult } from './metamask';
export {
  MetaMaskError,
  MetaMaskProviderMissing,
  MetaMaskUserRejected,
  MetaMaskPublicKeyRecoveryFailed,
  MetaMaskAddressMismatch,
  MetaMaskKeyPageNotVerified,
  MetaMaskIntentRejected,
  MetaMaskProofUnavailable,
  MetaMaskChallengeInvalid,
  buildChallenge,
  parseChallenge,
  recoverPublicKey,
  recoverAndVerify,
} from './metamask';
export type { RecoveredKey, ChallengeParams, MetaMaskErrorCode } from './metamask';
export { TEMPLATES, listTemplates, getTemplate, scaffoldFiles } from './templates/index';
export type { AppTemplate } from './templates/index';

export {
  SubClient,
  IntentSubClient,
  ObjectSubClient,
  PolicySubClient,
  ApprovalSubClient,
  EvidenceSubClient,
  TrustSubClient,
  CapabilitySubClient,
  RoleSubClient,
  SettlementSubClient,
  EscrowSubClient,
  DisclosureSubClient,
  AnchorSubClient,
  ContractSubClient,
  EvmSubClient,
  PredicateSubClient,
  CredentialSubClient,
  DID_METHOD_INFRIX,
  EIP712SubClient,
  NodeSubClient,
  PublicRoutesClient,
  PublicRouteError,
  BillingSubClient,
  CommitteeSubClient,
  EmergencySubClient,
  BlockSubClient,
  TransactionSubClient,
  AccountSubClient,
  RpcSubClient,
  GeneratedRouteReads,
} from './sub-clients';
export type {
  VerifiableCredential,
  IssueCredentialParams,
  SelectiveDisclosureRequest,
  DisclosureSpec,
} from './sub-clients';
export type {
  PredicateCatalog,
  PredicateCatalogEntry,
  PredicateProofEnvelope,
  PredicateVerifyResult,
  PredicateProveRequest,
  PredicateProver,
} from './sub-clients';
export type {
  NodeRoot,
  AssuranceMatrix,
  SubsystemTaxonomy,
  BillingConsumption,
  IntentBillingEntry,
  CommitteeList,
  CommitteeMotions,
  EmergencyCaseList,
  AccountList,
  Account,
  AccountBalance,
  ListAnswer,
  RegistryObjectAnswer,
} from './sub-clients';

// ---- Direct imports for internal use ----

import type { DevnetEvent } from './types/contract';
import { parseUserError, InfrixUserError, nodeAuthRequired, nodeRequestRefused } from './userError';
import { genQuery } from './sub-clients/gen/runtime';
import { checkPathValue, declaredMembers, refuseRemovedArguments, refuseUnknownOptions } from './sub-clients/routeShapes';

// The routes the shapes, swarm and mission reads below answer from; each answer carries exactly the
// members the route census declares for it.
const SHAPE_CURRENT_ROUTE = 'GET /v4/shapes/contracts/{contract}';
const SHAPE_RULES_ROUTE = 'GET /v4/shapes/contracts/{contract}/rules';
const SHAPE_HISTORY_ROUTE = 'GET /v4/shapes/contracts/{contract}/history';
const SHAPE_PARAMS_ROUTE = 'GET /v4/shapes/contracts/{contract}/params';
const SWARM_STATUS_ROUTE = 'GET /v4/swarms/{id}';
const SWARM_CHANNEL_ROUTE = 'GET /v4/swarms/{id}/channel/{key}';
const MISSION_STATUS_ROUTE = 'GET /v4/mission/contracts/{contract}';
const MISSION_SLOS_ROUTE = 'GET /v4/mission/contracts/{contract}/slos';
const MISSION_COST_ROUTE = 'GET /v4/mission/contracts/{contract}/cost';
const MISSION_LOGS_ROUTE = 'GET /v4/mission/contracts/{contract}/logs';
export { nodeAuthRequired, nodeRequestRefused } from './userError';

export {
  InfrixUserError,
  parseUserError,
  isStableErrorCode,
} from './userError';
export type { UserErrorPayload, UserErrorFix } from './userError';

import {
  IntentSubClient,
  ObjectSubClient,
  PolicySubClient,
  ApprovalSubClient,
  EvidenceSubClient,
  TrustSubClient,
  CapabilitySubClient,
  RoleSubClient,
  SettlementSubClient,
  EscrowSubClient,
  DisclosureSubClient,
  AnchorSubClient,
  ContractSubClient,
  EvmSubClient,
  PredicateSubClient,
  CredentialSubClient,
  EIP712SubClient,
  NodeSubClient,
  PublicRoutesClient,
  PublicRouteError,
  BillingSubClient,
  CommitteeSubClient,
  EmergencySubClient,
  BlockSubClient,
  TransactionSubClient,
  AccountSubClient,
  RpcSubClient,
  GeneratedRouteReads,
} from './sub-clients';

// ---- Onboarding telemetry (adoption-12) ----

/** A single SDK telemetry event passed to a developer-provided callback. */
export interface SdkTelemetryEvent {
  source?: 'sdk';
  event: string;
  method?: string;
  durationMs?: number;
  result: 'success' | 'failure';
  errorCode?: string;
}

/** Optional developer telemetry hook. The SDK never reports to the network on
 *  its own — it only invokes this callback. */
export interface SdkTelemetry {
  onEvent(event: SdkTelemetryEvent): void;
}

/** Options for {@link InfrixClient}. */
export interface InfrixClientOptions {
  telemetry?: SdkTelemetry;
  /**
   * Default Gap 12 disclosure context. The node rejects most governed calls
   * without an actor + purpose, so set them here at construction time (or later
   * via {@link InfrixClient.setDisclosureContext}). Supplying them here is
   * equivalent to calling setDisclosureContext immediately after construction.
   */
  actor?: string;
  purpose?: string;
  workflowInstance?: string;
  identity?: string;
  /**
   * Bearer token for a node that enforces `api.auth`. Such a node answers 401 to every governed
   * request without it (REST, `/rpc` and `/v4/jsonrpc` alike), and a public-profile node must
   * enforce it. The token is sent as `Authorization: Bearer <token>`; it is never included in an
   * error, an event, or telemetry. Read it from your own secret store, e.g.
   * `{ token: process.env.INFRIX_API_TOKEN }`.
   */
  token?: string;
}

/** True when running under Node (where a WebSocket can send request headers). */
function runsOnNode(): boolean {
  return typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string';
}

/**
 * How a WebSocket authenticates to a node that enforces `api.auth`: Node's `ws` and undici's WebSocket
 * take request headers; a browser WebSocket cannot send any, so it cannot authenticate and says so
 * rather than connecting without the token and being refused with nothing to read.
 */
export function webSocketAuthPlan(token: string | undefined, isNode: boolean): { headers?: Record<string, string> } {
  if (!token) return {};
  if (!isNode) {
    throw new InfrixUserError({
      code: 'NODE_AUTH_REQUIRED',
      title: 'The node requires an API bearer token',
      message:
        'A browser WebSocket cannot send an Authorization header, so subscribe() cannot authenticate here. Subscribe from Node, or through a proxy that adds the token.',
      fixes: [],
      docs: 'docs/errors/node-auth.md',
      retryable: false,
    });
  }
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** Bearer tokens by client, out of reach of enumeration. See InfrixClient.apiToken. */
const apiTokens = new WeakMap<object, string>();

/**
 * Named network presets so callers connect without hard-coding a node URL.
 * `kermit` is the canonical public testnet; `testnet` is an alias for it. A
 * value that already starts with http(s):// is used verbatim (P0-2/P0-3).
 */
const NETWORK_PRESETS: Record<string, string> = {
  kermit: 'https://devnet.infrix.opendlt.org',
  testnet: 'https://devnet.infrix.opendlt.org',
  local: 'http://localhost:8080',
};

/** Resolve a network name or URL to a base node URL. */
export function resolveNodeBaseUrl(target: string): string {
  const t = (target ?? '').trim();
  if (/^https?:\/\//i.test(t)) return t;
  const preset = NETWORK_PRESETS[t.toLowerCase()];
  if (preset) return preset;
  // Typed + agent-branchable (DX P4-3): an agent can catch error.code and retry
  // with a valid network instead of parsing a message.
  throw new InfrixUserError({
    code: 'INFRIX_UNKNOWN_NETWORK',
    title: `unknown network '${target}'`,
    message: `InfrixClient: unknown network '${target}'.`,
    fixes: [
      {
        label: `Pass a full http(s):// URL, or one of: ${Object.keys(NETWORK_PRESETS).join(', ')}`,
        safeToRun: true,
      },
    ],
    retryable: false,
  });
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

  // ---- PRIMARY: Governance Sub-Clients ----

  /** Intent lifecycle: submit, plan, approve, outcome, evidence. */
  readonly intents: IntentSubClient;

  /** Governed object operations: list, get, create, transition, audit. */
  readonly objects: ObjectSubClient;

  /** Policy evaluation and management: list, evaluate, simulate, decisions, conflicts. */
  readonly policies: PolicySubClient;

  /** Approval management: submit, list, pending, revoke. */
  readonly approvals: ApprovalSubClient;

  /** Production observability: metrics, SLOs, alerts, cost, logs and the system-wide view. */
  readonly mission: MissionClient;

  /** Evidence chain access: get, verify, export, anchor. */
  readonly evidence: EvidenceSubClient;

  /** Trust profile evaluation: list, get, evaluate, compare. */
  readonly trust: TrustSubClient;

  /** Capability grant management: list, grants, grant, revoke, check. */
  readonly capabilities: CapabilitySubClient;

  /** Role binding management: list, assign, check, revoke. */
  readonly roles: RoleSubClient;

  /** Settlement instruction management: list, create, approve, get. */
  readonly settlements: SettlementSubClient;

  /** Escrow management: list, create, release, dispute, get. */
  readonly escrows: EscrowSubClient;

  /** Disclosure grant management: list, grant, check, revoke. */
  readonly disclosures: DisclosureSubClient;

  /** L0 anchor verification: list, verify, stats, get. */
  readonly anchors: AnchorSubClient;

  /** ZK predicate catalog + read-only proof verification (catalog, verify). */
  readonly predicates: PredicateSubClient;

  /** DID + verifiable-credential ergonomics (createDID, issue, issuerDocument, presentationRequest). */
  readonly credentials: CredentialSubClient;

  /** MetaMask EIP-712 intent signing -> Accumulate submission (prepare, submit). */
  readonly eip712: EIP712SubClient;

  /** What the node says about itself: root, assurance matrix, subsystem taxonomy. */
  readonly node: NodeSubClient;

  /** The calling actor's IU billing: consumption for a period and the entry for one intent. */
  readonly billing: BillingSubClient;

  /** Committee state, visible to members only: list, motions. */
  readonly committees: CommitteeSubClient;

  /** Emergency cases, visible to emergency authorities only: cases. */
  readonly emergency: EmergencySubClient;

  /** The node's blocks: list, latest, get. */
  readonly blocks: BlockSubClient;

  /** The node's transactions: list, get, status. */
  readonly transactions: TransactionSubClient;

  /** The node's view of Accumulate accounts: list, get, balance. */
  readonly accounts: AccountSubClient;

  /** One typed method per JSON-RPC method no other sub-client names; each returns the node's answer untouched. */
  readonly jsonrpc: RpcSubClient;

  /** Typed reads of every GET route no hand-written client names, by route family (generated from the route census). */
  readonly routes: GeneratedRouteReads;

  // ---- Read-only Contract Inspection ----

  /**
   * Read-only contract inspection: query, simulate, inspect, schema.
   * State-changing contract operations (deploy, call, upgrade) must be
   * submitted as intents via `client.intents.submit(...)`.
   */
  readonly contracts: ContractSubClient;

  /**
   * The governed Solidity/EVM deploy door (DX P6-5): `evm.deploy(bytecode, { authority, creation })`
   * and `evm.call(addr, calldata)` (`creation: true` for a `solc --bin` file). These wrap raw EVM bytecode/calldata as
   * governed `EVM_DEPLOY` / `EVM_CALL` intents — the supported low-level EVM
   * door, still routed through the full spine (no raw-transaction bypass).
   */
  readonly evm: EvmSubClient;

  private restBase: string;
  private telemetry?: SdkTelemetry;
  /**
   * The bearer token is NOT a property: it lives in a module-level WeakMap keyed by the client, so
   * JSON.stringify(client), util.inspect(client) and Object.keys(client) cannot show it.
   */
  private get apiToken(): string | undefined {
    return apiTokens.get(this);
  }
  private defaultDisclosure: {
    actor?: string;
    purpose?: string;
    workflowInstance?: string;
    identity?: string;
  } = {};

  // emit calls the developer-provided telemetry callback, if any. The SDK does
  // NO default network reporting (adoption-12) — it only invokes the callback
  // the developer supplied, and never throws if that callback throws.
  private emit(event: SdkTelemetryEvent): void {
    if (!this.telemetry || typeof this.telemetry.onEvent !== 'function') return;
    try {
      this.telemetry.onEvent({ source: 'sdk', ...event });
    } catch {
      /* a developer callback must never break an SDK call */
    }
  }

  /**
   * Set the default Gap 12 disclosure context that every RPC call
   * will inject if the caller does not supply its own actor / purpose /
   * workflowInstance. Server-side handlers reject calls without
   * disclosure context, so most operations require at least an actor
   * + purpose to be set.
   *
   * @example
   *   client.setDisclosureContext({
   *     actor: 'acc://operator.acme',
   *     purpose: 'operational',
   *     workflowInstance: 'demo-001',
   *   });
   */
  setDisclosureContext(ctx: {
    actor?: string;
    purpose?: string;
    workflowInstance?: string;
    identity?: string;
  }): void {
    this.defaultDisclosure = { ...this.defaultDisclosure, ...ctx };
  }

  /**
   * Create a client connected to an Infrix node.
   * @param target A network name ('kermit' | 'testnet' | 'local') or a full
   *   base URL, e.g. "http://localhost:8080". Network names resolve via
   *   {@link resolveNodeBaseUrl}.
   * @param options Optional telemetry and default disclosure context. The node
   *   rejects most governed calls without an actor + purpose, so pass them here
   *   (or call {@link setDisclosureContext}).
   */
  constructor(target: string, options?: InfrixClientOptions) {
    const base = resolveNodeBaseUrl(target).replace(/\/+$/, '');
    this.rpcUrl = `${base}/rpc`;
    this.wsUrl = base.replace(/^http/, 'ws') + '/ws';
    this.restBase = base;
    this.telemetry = options?.telemetry;
    const token = options?.token?.trim();
    if (token) apiTokens.set(this, token);

    // Fold a disclosure context passed at construction into the default so the
    // first governed call already carries actor/purpose (P0-3).
    if (options && (options.actor || options.purpose || options.workflowInstance || options.identity)) {
      this.setDisclosureContext({
        actor: options.actor,
        purpose: options.purpose,
        workflowInstance: options.workflowInstance,
        identity: options.identity,
      });
    }

    const rpcFn = this.rpc.bind(this);
    const restFn = this.rest.bind(this);

    // PRIMARY: Governance sub-clients
    this.intents = new IntentSubClient(rpcFn, restFn);
    this.objects = new ObjectSubClient(rpcFn, restFn);
    this.policies = new PolicySubClient(rpcFn, restFn);
    this.approvals = new ApprovalSubClient(rpcFn, restFn);
    this.mission = new MissionClient(rpcFn, restFn);
    this.evidence = new EvidenceSubClient(rpcFn, restFn);
    this.trust = new TrustSubClient(rpcFn, restFn);
    this.capabilities = new CapabilitySubClient(rpcFn, restFn);
    this.roles = new RoleSubClient(rpcFn, restFn);
    this.settlements = new SettlementSubClient(rpcFn, restFn);
    this.escrows = new EscrowSubClient(rpcFn, restFn);
    this.disclosures = new DisclosureSubClient(rpcFn, restFn);
    this.anchors = new AnchorSubClient(rpcFn, restFn);
    this.predicates = new PredicateSubClient(rpcFn, restFn);
    this.credentials = new CredentialSubClient(rpcFn, restFn);
    this.eip712 = new EIP712SubClient(rpcFn, restFn);
    this.node = new NodeSubClient(rpcFn, restFn);
    this.billing = new BillingSubClient(rpcFn, restFn);
    this.committees = new CommitteeSubClient(rpcFn, restFn);
    this.emergency = new EmergencySubClient(rpcFn, restFn);
    this.blocks = new BlockSubClient(rpcFn, restFn);
    this.transactions = new TransactionSubClient(rpcFn, restFn);
    this.accounts = new AccountSubClient(rpcFn, restFn);
    this.jsonrpc = new RpcSubClient(rpcFn, restFn);
    this.routes = new GeneratedRouteReads(rpcFn, restFn);

    // SECONDARY: Contract sub-client
    this.contracts = new ContractSubClient(rpcFn, restFn);
    this.evm = new EvmSubClient(rpcFn, restFn);
  }

  // ---- Low-level RPC ----

  private async rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.idCounter;
    // Inject the default Gap 12 disclosure context for any field the
    // caller did not already set. Keeps callers from having to thread
    // actor / purpose / workflowInstance through every sub-client call.
    const mergedParams: Record<string, unknown> = { ...params };
    for (const k of ['actor', 'purpose', 'workflowInstance', 'identity'] as const) {
      if (mergedParams[k] === undefined && this.defaultDisclosure[k] !== undefined) {
        mergedParams[k] = this.defaultDisclosure[k];
      }
    }
    const body = JSON.stringify({ jsonrpc: '2.0', method, params: mergedParams, id });
    const rpcHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiToken) rpcHeaders['Authorization'] = `Bearer ${this.apiToken}`;
    const res = await fetch(this.rpcUrl, {
      method: 'POST',
      headers: rpcHeaders,
      body,
    });
    if (res.status === 401) {
      this.emit({ event: 'rpc.call', method, result: 'failure', errorCode: 'NODE_AUTH_REQUIRED' });
      throw nodeAuthRequired(this.apiToken !== undefined);
    }
    const json = await res.json();
    if (json.error) {
      const translated = parseUserError(json.error);
      const errorCode =
        translated?.code ?? (typeof json.error.code === 'string' ? json.error.code : undefined);
      if (translated) {
        this.emit({ event: 'rpc.call', method, result: 'failure', errorCode });
        throw translated;
      }
      // The node's bridge answers HTTP 200 with {"error":{"code":400,...}} for a request the route
      // refused: a 4xx numeric code is the node's refusal, typed like the CLI types it.
      if (typeof json.error.code === 'number' && json.error.code >= 400 && json.error.code < 500) {
        this.emit({ event: 'rpc.call', method, result: 'failure', errorCode: 'NODE_REQUEST_REFUSED' });
        throw json.error.code === 401
          ? nodeAuthRequired(this.apiToken !== undefined)
          : nodeRequestRefused(json.error.code, undefined, String(json.error.message ?? ''));
      }
      this.emit({ event: 'rpc.call', method, result: 'failure', errorCode });
      throw new InfrixRPCError(json.error.code, json.error.message);
    }
    this.emit({ event: 'rpc.call', method, result: 'success' });
    return json.result as T;
  }

  /**
   * Low-level REST against /v4/* endpoints. Parses the V4 envelope
   * (V4Response{Data, Governance, Meta} or V4Response{Error, Meta} per
   * pkg/api/v4/rest/middleware.go) and returns `result.data` on success
   * or throws InfrixRPCError on the envelope's error code+message.
   */
  private async rest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.restBase}${path}`;
    // Inject the Gap 12 disclosure context as headers (X-Actor /
    // X-Purpose / X-Workflow-Instance). Non-exempt /v4/* routes reject
    // requests missing these with 400; mirroring the RPC path's
    // default-context injection so REST sub-clients need no per-call
    // header plumbing.
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiToken) headers['Authorization'] = `Bearer ${this.apiToken}`;
    if (this.defaultDisclosure.actor) headers['X-Actor'] = this.defaultDisclosure.actor;
    if (this.defaultDisclosure.purpose) headers['X-Purpose'] = this.defaultDisclosure.purpose;
    if (this.defaultDisclosure.workflowInstance)
      headers['X-Workflow-Instance'] = this.defaultDisclosure.workflowInstance;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (res.status === 401) throw nodeAuthRequired(this.apiToken !== undefined);
    const json = await res.json();
    if (json && json.error) {
      // v4 errors carry a stable string code (adoption-08) — surface the typed,
      // actionable InfrixUserError so callers get the same code+fixes the CLI
      // shows. Fall back to InfrixRPCError for legacy numeric-coded errors.
      const translated = parseUserError(json.error);
      if (translated) throw translated;
      const msg = typeof json.error.message === 'string' ? json.error.message : 'rest error';
      // A v4 refusal carries the node's own string code (BAD_REQUEST, ...) and an HTTP 4xx.
      if (res.status >= 400 && res.status < 500) {
        throw nodeRequestRefused(res.status, typeof json.error.code === 'string' ? json.error.code : undefined, msg);
      }
      const code = typeof json.error.code === 'number' ? json.error.code : -32603;
      throw new InfrixRPCError(code, msg);
    }
    return (json && json.data !== undefined ? json.data : json) as T;
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
    const g = globalThis as { WebSocket?: typeof WebSocket; require?: (m: string) => unknown };
    const WS: typeof WebSocket = g.WebSocket ?? (g.require ? (g.require('ws') as typeof WebSocket) : (undefined as unknown as typeof WebSocket));
    const plan = webSocketAuthPlan(this.apiToken, runsOnNode());
    const ws: WebSocket = plan.headers
      ? new (WS as unknown as new (url: string, opts: { headers: Record<string, string> }) => WebSocket)(this.wsUrl, { headers: plan.headers })
      : new WS(this.wsUrl);

    ws.onopen = () => {
      if (eventType) {
        ws.send(JSON.stringify({ action: 'subscribe', eventType }));
      }
    };

    ws.onmessage = (msg: { data: unknown }) => {
      try {
        const raw = typeof msg.data === 'string'
          ? msg.data
          : (msg.data as { toString(): string }).toString();
        const event = JSON.parse(raw);
        onEvent(event);
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      ws.close();
    };
  }

  /**
   * Alias of `subscribe` for callers that prefer the verbose name.
   * Some sub-clients (shapes, swarm) call this internally.
   */
  subscribeEvents(_filter: unknown, onEvent: (event: Record<string, unknown>) => void): () => void {
    return this.subscribe(onEvent as unknown as (event: DevnetEvent) => void);
  }

  // ---- Shape-Shifting Contracts ----

  /** Shapes sub-client for shape-shifting contract queries. */
  shapes = {
    /** Get the current active shape for a contract (REST GET /v4/shapes/contracts/{contract}). */
    current: async (contractUrl: string): Promise<ShapeInfo> => {
      checkPathValue(SHAPE_CURRENT_ROUTE, 'contract', contractUrl);
      const answer = await this.rest<unknown>('GET', `/v4/shapes/contracts/${encodeURIComponent(contractUrl)}`);
      return declaredMembers<ShapeInfo>(SHAPE_CURRENT_ROUTE, answer, ['contract', 'shape']);
    },

    /** Get evolution rules for a contract (REST GET /v4/shapes/contracts/{contract}/rules). */
    rules: async (contractUrl: string): Promise<ShapeRulesResult> => {
      checkPathValue(SHAPE_RULES_ROUTE, 'contract', contractUrl);
      const answer = await this.rest<unknown>('GET', `/v4/shapes/contracts/${encodeURIComponent(contractUrl)}/rules`);
      return declaredMembers<ShapeRulesResult>(SHAPE_RULES_ROUTE, answer, ['contract', 'detail', 'rules']);
    },

    /**
     * Get the shape transition history of a contract (REST GET /v4/shapes/contracts/{contract}/history).
     * The route takes no parameters: it answers every transition it holds, so the `opts` (`limit`) argument
     * it once took is refused by name.
     */
    history: async (contractUrl: string, ...removed: never[]): Promise<ShapeHistoryResult> => {
      refuseRemovedArguments('shapes.history', removed, ['opts']);
      checkPathValue(SHAPE_HISTORY_ROUTE, 'contract', contractUrl);
      const answer = await this.rest<unknown>('GET', `/v4/shapes/contracts/${encodeURIComponent(contractUrl)}/history`);
      return declaredMembers<ShapeHistoryResult>(SHAPE_HISTORY_ROUTE, answer, ['contract', 'total', 'transitions']);
    },

    /** Get the current shape's parameters (REST GET /v4/shapes/contracts/{contract}/params). */
    params: async (contractUrl: string): Promise<ShapeParamsResult> => {
      checkPathValue(SHAPE_PARAMS_ROUTE, 'contract', contractUrl);
      const answer = await this.rest<unknown>('GET', `/v4/shapes/contracts/${encodeURIComponent(contractUrl)}/params`);
      return declaredMembers<ShapeParamsResult>(SHAPE_PARAMS_ROUTE, answer, [
        'activeShape', 'contract', 'defaultShape', 'parameterSchema', 'parameters',
      ]);
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

/** What GET /v4/shapes/contracts/{contract} answers: every member the route declares. */
export interface ShapeInfo {
  readonly contract: unknown;
  /** The contract's active shape. */
  readonly shape: unknown;
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

/** What GET /v4/shapes/contracts/{contract}/rules answers: every member the route declares. */
export interface ShapeRulesResult {
  readonly contract: unknown;
  readonly detail: unknown;
  readonly rules: EvolutionRuleDef[];
}

/** What GET /v4/shapes/contracts/{contract}/history answers: every member the route declares. */
export interface ShapeHistoryResult {
  readonly contract: unknown;
  readonly total: unknown;
  /** The shape transitions the contract has made. */
  readonly transitions: unknown;
}

/** What GET /v4/shapes/contracts/{contract}/params answers: every member the route declares. */
export interface ShapeParamsResult {
  readonly activeShape: unknown;
  readonly contract: unknown;
  readonly defaultShape: unknown;
  readonly parameterSchema: unknown;
  readonly parameters: unknown;
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

// ---- Swarm Contract Types ----

/** What GET /v4/swarms/{id} answers: every member the route declares. */
export interface SwarmStatus {
  readonly createdAt: unknown;
  readonly gasBudget: unknown;
  readonly id: string;
  readonly lifecycle: unknown;
  readonly maxMembers: unknown;
  readonly members: SwarmMemberInfo[];
  readonly name: string;
  readonly state: unknown;
  readonly updatedAt: unknown;
  readonly version: number;
}

export interface SwarmMemberInfo {
  address: string;
  alias: string;
  role?: string;
  state: string;
}

/** What GET /v4/swarms/{id}/channel/{key} answers: every member the route declares. */
export interface SwarmChannelValue {
  readonly gas: unknown;
  readonly key: string;
  readonly swarmId: unknown;
  readonly value: string;
}

export interface SwarmCoordinateResult {
  action_name: string;
  step_results: SwarmStepResult[];
  gas_used: number;
  block_height: number;
}

export interface SwarmStepResult {
  step_index: number;
  target_member: string;
  function: string;
  return_value?: string;
  gas_used: number;
  error?: string;
  reverted: boolean;
}

export interface SwarmUpgradeResult {
  proposal_id: string;
  status: string;
  compatibility_results: SwarmCompatResult[];
}

export interface SwarmCompatResult {
  member_alias: string;
  compatible: boolean;
  issues?: string[];
}

/** SwarmClient provides methods for interacting with swarm contracts. */
export class SwarmClient {
  constructor(
    private rpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>,
    private rest: <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: unknown) => Promise<T>,
  ) {}

  /** Get swarm status (REST GET /v4/swarms/{id}). */
  async status(swarmId: string): Promise<SwarmStatus> {
    checkPathValue(SWARM_STATUS_ROUTE, 'id', swarmId);
    const answer = await this.rest<unknown>('GET', `/v4/swarms/${encodeURIComponent(swarmId)}`);
    return declaredMembers<SwarmStatus>(SWARM_STATUS_ROUTE, answer, [
      'createdAt', 'gasBudget', 'id', 'lifecycle', 'maxMembers', 'members', 'name', 'state', 'updatedAt', 'version',
    ]);
  }

  /** Read a channel value (REST GET /v4/swarms/{id}/channel/{key}). */
  async channelGet(swarmId: string, key: string): Promise<SwarmChannelValue> {
    checkPathValue(SWARM_CHANNEL_ROUTE, 'id', swarmId);
    checkPathValue(SWARM_CHANNEL_ROUTE, 'key', key);
    const answer = await this.rest<unknown>(
      'GET',
      `/v4/swarms/${encodeURIComponent(swarmId)}/channel/${encodeURIComponent(key)}`,
    );
    return declaredMembers<SwarmChannelValue>(SWARM_CHANNEL_ROUTE, answer, ['gas', 'key', 'swarmId', 'value']);
  }

  /** Write a channel value. */
  async channelSet(swarmId: string, key: string, value: string): Promise<void> {
    await this.rpc<void>('swarm.channel.set', { swarm_id: swarmId, key, value });
  }

  /** Execute a coordinated action. */
  async coordinate(swarmId: string, action: string, args: Record<string, unknown> = {}): Promise<SwarmCoordinateResult> {
    return this.rpc<SwarmCoordinateResult>('swarm.coordinate', { swarm_id: swarmId, action, args });
  }

  /** Add a member to the swarm. */
  async addMember(swarmId: string, address: string, alias: string, role?: string): Promise<void> {
    await this.rpc<void>('swarm.add_member', { swarm_id: swarmId, address, alias, role });
  }

  /** Remove a member from the swarm. */
  async removeMember(swarmId: string, alias: string): Promise<void> {
    await this.rpc<void>('swarm.remove_member', { swarm_id: swarmId, alias });
  }

  /** Resume a swarm from collective immune state. */
  async resume(swarmId: string): Promise<void> {
    await this.rpc<void>('swarm.resume', { swarm_id: swarmId });
  }

  /** Dissolve a swarm. */
  async dissolve(swarmId: string): Promise<void> {
    await this.rpc<void>('swarm.dissolve', { swarm_id: swarmId });
  }

  /** Submit an upgrade proposal. */
  async upgrade(swarmId: string, proposal: Record<string, unknown>): Promise<SwarmUpgradeResult> {
    return this.rpc<SwarmUpgradeResult>('swarm.upgrade', { swarm_id: swarmId, ...proposal });
  }
}

// ---- Mission Control Types ----

/** What GET /v4/mission/system answers: the system-wide metrics nested under `system`. */
export interface MissionSystemMetrics {
  block_height: number;
  contracts_total: number;
  contracts_healthy: number;
  contracts_quarantined: number;
  contracts_throttled: number;
  contracts_paused: number;
  contracts_frozen: number;
  swarms_total: number;
  shape_shifting_contracts: number;
  total_calls_this_block: number;
  total_gas_this_block: number;
}

export interface MissionSystemAnswer {
  system: MissionSystemMetrics;
  contractCount: number;
  scope: string;
}

/** What GET /v4/mission/contracts/{contract} answers: every member the route declares. */
export interface MissionStatus {
  readonly contract: unknown;
  /** The contract's metrics. */
  readonly metrics: unknown;
}

/** What GET /v4/mission/contracts/{contract}/slos answers: every member the route declares. */
export interface MissionSLOList {
  readonly contract: unknown;
  /** The SLOs defined for the contract. */
  readonly definitions: unknown;
  /** How each SLO is doing. */
  readonly status: unknown;
}

export interface MissionAlert {
  id: string;
  contract_url: string;
  severity: string;
  title: string;
  metric_name: string;
  metric_value: number;
  status: string;
}

/** What GET /v4/mission/contracts/{contract}/cost answers: every member the route declares. */
export interface MissionCostReport {
  readonly contract: unknown;
}

/** What GET /v4/mission/contracts/{contract}/logs answers: every member the route declares. */
export interface MissionLogs {
  readonly contract: unknown;
  /** The log entries returned. */
  readonly entries: unknown;
  /** The level the entries were filtered to. */
  readonly level: unknown;
}

/** MissionClient provides production observability methods. */
export class MissionClient {
  constructor(
    private rpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>,
    private rest: <T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', path: string, body?: unknown) => Promise<T>,
  ) {}

  /** A contract's status (REST GET /v4/mission/contracts/{contract}): its `metrics`. */
  async status(contract: string): Promise<MissionStatus> {
    checkPathValue(MISSION_STATUS_ROUTE, 'contract', contract);
    const answer = await this.rest<unknown>('GET', `/v4/mission/contracts/${encodeURIComponent(contract)}`);
    return declaredMembers<MissionStatus>(MISSION_STATUS_ROUTE, answer, ['contract', 'metrics']);
  }
  /** A contract's SLOs (REST GET /v4/mission/contracts/{contract}/slos): `definitions` and their `status`. */
  async sloList(contract: string): Promise<MissionSLOList> {
    checkPathValue(MISSION_SLOS_ROUTE, 'contract', contract);
    const answer = await this.rest<unknown>('GET', `/v4/mission/contracts/${encodeURIComponent(contract)}/slos`);
    return declaredMembers<MissionSLOList>(MISSION_SLOS_ROUTE, answer, ['contract', 'definitions', 'status']);
  }
  async sloCreate(contract: string, metric: string, target: number, window: string): Promise<void> {
    await this.rpc<void>('mission.slo.create', { contract, metric, target, window });
  }
  /**
   * Firing alerts for one contract.
   *
   * The alert routes are per-contract because an unscoped listing discloses
   * which contracts exist and which are failing. This used to send no contract
   * at all and read `alerts` from a response whose list is called `active`,
   * so it returned undefined against every node.
   */
  async alerts(contract: string): Promise<MissionAlert[]> {
    const r = await this.rpc<{ active: MissionAlert[] }>('mission.alert.list', { contract });
    return r.active ?? [];
  }

  /**
   * Every firing alert in the repo. Audit/investigation purposes only — the
   * node answers NOT-FOUND to any other disclosure purpose.
   */
  async systemAlerts(): Promise<MissionAlert[]> {
    const r = await this.rpc<{ active: MissionAlert[] }>('mission.alert.system', {});
    return r.active ?? [];
  }
  /**
   * A contract's cost report (REST GET /v4/mission/contracts/{contract}/cost). The route takes no
   * parameters: there is no period to ask for (the `period` argument is refused by name), and the answer
   * declares only the `contract`.
   */
  async cost(contract: string, ...removed: never[]): Promise<MissionCostReport> {
    refuseRemovedArguments('mission.cost', removed, ['period']);
    checkPathValue(MISSION_COST_ROUTE, 'contract', contract);
    const answer = await this.rest<unknown>('GET', `/v4/mission/contracts/${encodeURIComponent(contract)}/cost`);
    return declaredMembers<MissionCostReport>(MISSION_COST_ROUTE, answer, ['contract']);
  }
  /**
   * A contract's log entries (REST GET /v4/mission/contracts/{contract}/logs).
   *
   * @param opts - Only the parameters the route accepts: `level` and `limit`.
   */
  async logs(contract: string, opts: { level?: string; limit?: number } = {}): Promise<MissionLogs> {
    refuseUnknownOptions('mission.logs', MISSION_LOGS_ROUTE, opts, ['level', 'limit']);
    checkPathValue(MISSION_LOGS_ROUTE, 'contract', contract);
    const query = genQuery(MISSION_LOGS_ROUTE, [
      ['level', opts.level, 'string'],
      ['limit', opts.limit, 'int'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/mission/contracts/${encodeURIComponent(contract)}/logs${query}`);
    return declaredMembers<MissionLogs>(MISSION_LOGS_ROUTE, answer, ['contract', 'entries', 'level']);
  }
  /**
   * The system-wide metrics. Audit/investigation purposes only — the node answers NOT-FOUND to any
   * other disclosure purpose, so construct the client with `purpose: 'audit'`.
   */
  async global(): Promise<MissionSystemAnswer> {
    return this.rpc<MissionSystemAnswer>('mission.global', {});
  }
}

// adoption-06 — the canonical proof receipt surface.
export * from './proofReceipt';

// nextux-01 — the Agent Action Protocol client. Exposed both as a top-level
// named export and under the `agent` namespace (the latter avoids any
// type-name clashes with the governance surface).
export { InfrixAgentClient } from './agent/client';
export type { InfrixAgentClientOptions, RunOptions, FetchLike } from './agent/client';
export * as agent from './agent';

// nextux-02 — scenario builder + proof-story verifier, under the `scenario`
// namespace to avoid type-name clashes.
export * as scenario from './scenario';

// nextux-06 — Intent Copilot Workbench plan reader, under the `workbench`
// namespace to avoid type-name clashes.
export * as workbench from './workbench';

// nextux-07 — Proof Inbox + Collaboration: types, an offline decision/receipt
// verifier, and a typed client, under the `inbox` namespace.
export * as inbox from './inbox';

// nextux-08 — Wallet & Identity Control Center: a cross-language signature
// explainer, scoped-session validation, MetaMask connect, and a typed client,
// under the `identity` namespace.
export * as identity from './identity';

// nextux-10 — Zero-Context Local Companion: honest context helpers + a typed
// client over the localhost-only companion server, under the `companion`
// namespace.
export * as companion from './companion';

// nextux-11 — Proof Quest Mode: catalog, progress-trail, and progress-receipt
// types + honest helpers, under the `quests` namespace.
export * as quests from './quests';

// nextux-12 — Visual Workflow Studio: flow, simulation, and export types +
// honest helpers (a simulation is never a live proof), under the `studio`
// namespace.
export * as studio from './studio';

// nextux-13 — Conversational Proof Tutor: explanation, lesson, and quiz types +
// honest helpers (never claims L4 unless the verifier supports it; audience
// changes wording only), under the `tutor` namespace.
export * as tutor from './tutor';

// nextux-14 — Multiplayer Demo Rooms: role, event, replay, and room-summary
// types + honest helpers (a viewer never approves, an agent never approves
// without delegation, the proof never exceeds the verifier), under the `rooms`
// namespace.
export * as rooms from './rooms';

// nextux-15 — Migration & Comparison Lab: report and scaffold types + honest
// helpers (every external claim is sourced/dated or an assumption; a scaffold's
// SDK routes through governance and never targets mainnet), under the `compare`
// namespace.
export * as compare from './compare';

// nextux-16 — Prompt-to-Proof App Studio: the single golden front door. Workspace,
// run, assurance, and resume types + honest guards (assurance always from the
// verifier, the node never trusted, local proof never L4, never mainnet), under
// the `app` namespace.
export * as app from './app';

// Default export for convenience.
export default InfrixClient;

// A.ABI.RESULTCODE.REGISTRY: the ABI's contract result codes, so a caller can
// tell an unknown selector apart from a domain refusal instead of seeing only
// that the contract said no.
export {
  CONTRACT_RESULT_CODES,
  classifyContractResultCode,
  contractResultName,
  describeContractRefusal,
} from './contractResultCode';
export type { ContractFailureClass, ContractRefusal } from './contractResultCode';
