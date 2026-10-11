import { SubClient } from './base';
import type { RestMethod } from './base';

/**
 * The node's own API: its identity, the assurance matrix and the subsystem taxonomy.
 *
 * Each read is a plain GET of one route. The routes are held as "VERB /path" so the line that
 * names a route is the line that says how it is read.
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

/** What GET /v4/network/status answers. The node adds counters of its own (height, uptime). */
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
 */
export class NodeSubClient extends SubClient {
  private read<T>(route: string): Promise<T> {
    const space = route.indexOf(' ');
    return this.rest<T>(route.slice(0, space) as RestMethod, route.slice(space + 1));
  }

  /** The node's identity, spine and subsystem tiers. */
  async root(): Promise<NodeRoot> {
    return this.read<NodeRoot>(ROUTE_ROOT);
  }

  /** The assurance matrix: proof levels, governance levels and the IU assurance classes. */
  async assurance(): Promise<AssuranceMatrix> {
    return this.read<AssuranceMatrix>(ROUTE_ASSURANCE);
  }

  /** The subsystem taxonomy, the spine's owners and the packages awaiting a tier graduation. */
  async subsystems(): Promise<SubsystemTaxonomy> {
    return this.read<SubsystemTaxonomy>(ROUTE_SUBSYSTEMS);
  }

  /** The network the node serves: its name, chain id and head block height. */
  async network(): Promise<NetworkInfo> {
    return this.read<NetworkInfo>(ROUTE_NETWORK);
  }

  /** The node's network status. */
  async networkStatus(): Promise<NetworkStatus> {
    return this.read<NetworkStatus>(ROUTE_NETWORK_STATUS);
  }

  /** The DID document of the node's credential issuer; 503 on a node that issues no credentials. */
  async issuerDid(): Promise<IssuerDidDocument> {
    return this.read<IssuerDidDocument>(ROUTE_ISSUER_DID);
  }

  /** The claim manifest: the profile the node stands behind and the capabilities it supports. */
  async claims(): Promise<ClaimManifest> {
    return this.read<ClaimManifest>(ROUTE_CLAIMS);
  }
}
