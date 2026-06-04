/**
 * Governance-first surface assertions (Gap 15).
 *
 * Compile-time shape checks: the contract sub-client exposes only
 * read-only methods, and the public module re-exports no legacy
 * contract-mutation types or the legacy IntentClient.
 *
 * This file is picked up by `tsc --noEmit`; if any forbidden surface
 * reappears the compile fails.
 */
import { InfrixClient, ContractSubClient } from './index';
import type * as pub from './index';

// ---- ContractSubClient shape ----
type ContractKeys = keyof ContractSubClient;
type ForbiddenContractMethods = 'deploy' | 'call' | 'upgrade' | 'callBatch';
type RequiredContractMethods = 'query' | 'simulate' | 'inspect' | 'schema';

type _NoForbiddenContract = Extract<ContractKeys, ForbiddenContractMethods> extends never
  ? true
  : false;
type _HasRequiredContract = RequiredContractMethods extends ContractKeys ? true : false;

const _noForbiddenContract: _NoForbiddenContract = true;
const _hasRequiredContract: _HasRequiredContract = true;
void _noForbiddenContract;
void _hasRequiredContract;

// ---- InfrixClient top-level governance surface ----
type ClientKeys = keyof InfrixClient;
type RequiredClientMembers =
  | 'intents'
  | 'policies'
  | 'approvals'
  | 'evidence'
  | 'trust'
  | 'anchors'
  | 'objects'
  | 'roles'
  | 'capabilities'
  | 'settlements'
  | 'escrows'
  | 'disclosures'
  | 'predicates'
  | 'eip712'
  | 'contracts';
type _HasClientMembers = RequiredClientMembers extends ClientKeys ? true : false;
const _hasClientMembers: _HasClientMembers = true;
void _hasClientMembers;

// ---- No legacy IntentClient or mutation types re-exported ----
type _PublicExports = keyof typeof pub;
type _Forbidden =
  | 'IntentClient'
  | 'IntentResolveResult'
  | 'IntentExecuteResult'
  | 'IntentRankedPath'
  | 'IntentGraphNode'
  | 'DeployResult'
  | 'UpgradeResult'
  | 'BatchCallRequest'
  | 'BatchCallResult';
type _NoForbiddenExports = Extract<_PublicExports, _Forbidden> extends never ? true : false;
const _noForbiddenExports: _NoForbiddenExports = true;
void _noForbiddenExports;
