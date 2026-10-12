import { SubClient } from './base';
import { declaredMembers } from './routeShapes';

/**
 * The node's own API: its identity, the assurance matrix and the subsystem taxonomy.
 *
 * The routes are held as "VERB /path" as the route census names them (docs/release/census/
 * rest-response-shapes.txt of infrix-core); the path each read requests is written at its call.
 */
const ROUTE_ROOT = 'GET /v4/';
const ROUTE_ASSURANCE = 'GET /v4/assurance';
const ROUTE_SUBSYSTEMS = 'GET /v4/network/subsystems';
const ROUTE_NETWORK = 'GET /v4/network';
const ROUTE_NETWORK_STATUS = 'GET /v4/network/status';
const ROUTE_ISSUER_DID = 'GET /v4/network/issuer-did';
const ROUTE_CLAIMS = 'GET /v4/claims';

/** What GET /v4/ answers. */
export interface NodeRoot {
  system: string;
  identity: string;
  apiVersion: string;
  /** The seven spine stages in order. */
  spine: string[];
  /** The subsystem tiers (canonical, support, specialized, experimental) with their members. */
  subsystems: Record<string, string>;
}

/** What GET /v4/assurance answers: how an action's assurance is classified and billed. */
export interface AssuranceMatrix {
  summary: string;
  proofLevels: Array<{ level: string; description: string }>;
  governanceLevels: Array<{ level: string; description: string }>;
  iuClasses: Array<{ class: string; multiplier: number; description: string }>;
}

/** What GET /v4/network/subsystems answers. */
export interface SubsystemTaxonomy {
  subsystems: Array<{ package: string; tier: string; spineStages: string[] | null }>;
  spine: Array<{
    stage: string;
    owner: string;
    objectTypes: string[] | null;
    policyTypes: string[] | null;
    traceKinds: string[] | null;
  }>;
  graduations: Array<{
    package: string;
    currentTier: string;
    targetTier: string;
    blockedBy: string[] | null;
  }>;
}

/** What GET /v4/network answers. */
export interface NetworkInfo {
  apiVersion: string;
  blockHeight: number;
  chainId: string;
  network: string;
}

/** What GET /v4/network/status answers: the members the route declares (it declares only apiVersion). */
export interface NetworkStatus {
  apiVersion: string;
}

/** What GET /v4/network/issuer-did answers: the DID document of the node's credential issuer. */
export interface IssuerDidDocument {
  '@context': string | string[];
  id: string;
}

/** What GET /v4/claims answers: the profile the node stands behind and what it supports. */
export interface ClaimManifest {
  selectedProfile: string;
  supportedCapabilities: string[];
}

/**
 * NodeSubClient reads what a node says about itself. None of it is per-actor data.
 *
 * Each read is a plain GET of one route, and answers exactly the members that route declares: an answer that
 * lacks one is refused rather than read as empty, and nothing the route does not declare is handed on.
 */
export class NodeSubClient extends SubClient {
  /** The node's identity, spine and subsystem tiers. */
  async root(): Promise<NodeRoot> {
    const answer = await this.rest<unknown>('GET', '/v4/');
    return declaredMembers<NodeRoot>(ROUTE_ROOT, answer, ['apiVersion', 'identity', 'spine', 'subsystems', 'system']);
  }

  /** The assurance matrix: proof levels, governance levels and the IU assurance classes. */
  async assurance(): Promise<AssuranceMatrix> {
    const answer = await this.rest<unknown>('GET', '/v4/assurance');
    return declaredMembers<AssuranceMatrix>(ROUTE_ASSURANCE, answer, ['governanceLevels', 'iuClasses', 'proofLevels', 'summary']);
  }

  /** The subsystem taxonomy, the spine's owners and the packages awaiting a tier graduation. */
  async subsystems(): Promise<SubsystemTaxonomy> {
    const answer = await this.rest<unknown>('GET', '/v4/network/subsystems');
    return declaredMembers<SubsystemTaxonomy>(ROUTE_SUBSYSTEMS, answer, ['graduations', 'spine', 'subsystems']);
  }

  /** The network the node serves: its name, chain id and head block height. */
  async network(): Promise<NetworkInfo> {
    const answer = await this.rest<unknown>('GET', '/v4/network');
    return declaredMembers<NetworkInfo>(ROUTE_NETWORK, answer, ['apiVersion', 'blockHeight', 'chainId', 'network']);
  }

  /** The node's network status. */
  async networkStatus(): Promise<NetworkStatus> {
    const answer = await this.rest<unknown>('GET', '/v4/network/status');
    return declaredMembers<NetworkStatus>(ROUTE_NETWORK_STATUS, answer, ['apiVersion']);
  }

  /** The DID document of the node's credential issuer; 503 on a node that issues no credentials. */
  async issuerDid(): Promise<IssuerDidDocument> {
    const answer = await this.rest<unknown>('GET', '/v4/network/issuer-did');
    return declaredMembers<IssuerDidDocument>(ROUTE_ISSUER_DID, answer, ['@context', 'id']);
  }

  /** The claim manifest: the profile the node stands behind and the capabilities it supports. */
  async claims(): Promise<ClaimManifest> {
    const answer = await this.rest<unknown>('GET', '/v4/claims');
    return declaredMembers<ClaimManifest>(ROUTE_CLAIMS, answer, ['selectedProfile', 'supportedCapabilities']);
  }
}
