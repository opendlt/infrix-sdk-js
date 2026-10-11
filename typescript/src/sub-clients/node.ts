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
}
