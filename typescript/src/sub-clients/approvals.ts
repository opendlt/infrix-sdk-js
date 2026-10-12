import { SubClient } from './base';
import { genQuery } from './gen/runtime';
import {
  LIST_MEMBERS,
  REGISTRY_OBJECT_MEMBERS,
  checkPathValue,
  declaredMembers,
} from './routeShapes';
import type { ListAnswer, RegistryObjectAnswer } from './routeShapes';
import type {
  ApprovalEnvelope,
  ApprovalListFilter,
  ApprovalSigningRequest,
  ApprovalSubmitOptions,
} from '../types/governance';

const LIST_ROUTE = 'GET /v4/approvals';
const PENDING_ROUTE = 'GET /v4/approvals/pending';
const GET_ROUTE = 'GET /v4/approvals/{id}';
const SIGNING_ROUTE = 'GET /v4/intents/approval-signing';

/**
 * ApprovalSubClient provides approval management operations.
 *
 * Every read answers exactly the members its route declares; an answer that lacks one is refused
 * rather than read as empty.
 */
export class ApprovalSubClient extends SubClient {
  /**
   * Submit a cryptographically signed approval for a target.
   *
   * @param targetType - The target domain being approved (intent, object, settlement, etc.)
   * @param targetId - The ID of the target being approved (intentId, objectId, etc.)
   * @param planHash - SHA-256 hash of the plan/state being approved
   * @param opts - Identity, role, key page, rationale, and the Ed25519 signature over
   *               the canonical preimage from {@link signing}
   */
  async submit(
    targetType: string,
    targetId: string,
    planHash: string,
    opts: ApprovalSubmitOptions
  ): Promise<ApprovalEnvelope> {
    return this.rpc<ApprovalEnvelope>('approval.submit', {
      targetType,
      targetId,
      planHash,
      ...opts,
    });
  }

  /**
   * Fetch what the caller must sign to approve a parked stage (REST GET
   * /v4/intents/approval-signing). The approving identity is the asserted actor
   * (`signerIdentity` in the answer); the material is bound to it and the key page.
   * Recompute the digest from the fields before signing (@infrix/wallet
   * bindApprovalSigningRequest does this).
   *
   * @param intentId - The parked intent
   * @param keyPageRef - Your key page whose entry is sha256(signing public key)
   * @param opts - stageId / role, when the plan has more than one
   */
  async signing(
    intentId: string,
    keyPageRef: string,
    opts?: { stageId?: string; role?: string }
  ): Promise<ApprovalSigningRequest> {
    const query = genQuery(SIGNING_ROUTE, [
      ['intentId', intentId, 'string'],
      ['keyPageRef', keyPageRef, 'string'],
      ['role', opts?.role, 'string'],
      ['stageId', opts?.stageId, 'string'],
    ]);
    const answer = await this.rest<unknown>('GET', `/v4/intents/approval-signing${query}`);
    return declaredMembers<ApprovalSigningRequest>(SIGNING_ROUTE, answer, [
      'conditions', 'digest', 'keyPageRef', 'planHash', 'scope',
      'signerIdentity', 'simulationHash', 'stageId', 'workflowId',
    ]);
  }

  /**
   * List the approvals the caller can see (REST GET /v4/approvals).
   *
   * @param filter - Only the filter the route accepts: `status`.
   * @returns `items` and `pagination`.
   */
  async list(filter: ApprovalListFilter = {}): Promise<ListAnswer> {
    const query = genQuery(LIST_ROUTE, [['status', filter.status, 'string']]);
    const answer = await this.rest<unknown>('GET', `/v4/approvals${query}`);
    return declaredMembers<ListAnswer>(LIST_ROUTE, answer, LIST_MEMBERS);
  }

  /**
   * The approvals pending for the calling actor (REST GET /v4/approvals/pending). The route takes no
   * parameters: the node scopes the answer to the actor the client's disclosure context names, so
   * construct the client with the approver as `actor`.
   *
   * @returns `items` and `pagination`.
   */
  async pending(): Promise<ListAnswer> {
    const answer = await this.rest<unknown>('GET', '/v4/approvals/pending');
    return declaredMembers<ListAnswer>(PENDING_ROUTE, answer, LIST_MEMBERS);
  }

  /**
   * Revoke a previously submitted approval.
   *
   * @param approvalId - The approval to revoke
   * @param reason - Revocation reason
   */
  async revoke(approvalId: string, reason?: string): Promise<void> {
    await this.rpc<void>('approval.revoke', { approvalId, reason });
  }

  /**
   * Get one approval by id (REST GET /v4/approvals/{id}) as the object registry holds it: the
   * approval's own record is in `fields`.
   */
  async get(approvalId: string): Promise<RegistryObjectAnswer> {
    checkPathValue(GET_ROUTE, 'id', approvalId);
    const answer = await this.rest<unknown>('GET', `/v4/approvals/${encodeURIComponent(approvalId)}`);
    return declaredMembers<RegistryObjectAnswer>(GET_ROUTE, answer, REGISTRY_OBJECT_MEMBERS);
  }
}
