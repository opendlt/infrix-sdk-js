import { SubClient } from './base';
import type {
  ApprovalEnvelope,
  ApprovalListFilter,
  ApprovalSubmitOptions,
} from '../types/governance';

/**
 * ApprovalSubClient provides approval management operations.
 */
export class ApprovalSubClient extends SubClient {
  /**
   * Submit a cryptographically signed approval for a target.
   *
   * @param targetType - The target domain being approved (intent, object, settlement, etc.)
   * @param targetId - The ID of the target being approved (intentId, objectId, etc.)
   * @param planHash - SHA-256 hash of the plan/state being approved
   * @param opts - Identity, role, conditions, scope, and Ed25519 proof fields
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
   * List approvals with optional filtering.
   *
   * @param filter - Filter by targetId, status, identity, date range
   */
  async list(
    filter?: ApprovalListFilter
  ): Promise<{ approvals: ApprovalEnvelope[]; total: number }> {
    return this.rpc<{ approvals: ApprovalEnvelope[]; total: number }>(
      'approval.list',
      (filter ?? {}) as Record<string, unknown>
    );
  }

  /**
   * List approvals pending for a specific identity.
   *
   * @param identity - The identity (DID or ADI URL)
   */
  async pending(
    identity: string
  ): Promise<{ approvals: ApprovalEnvelope[]; total: number }> {
    return this.rpc<{ approvals: ApprovalEnvelope[]; total: number }>(
      'approval.pending',
      { identity }
    );
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
   * Get a specific approval by ID.
   */
  async get(approvalId: string): Promise<ApprovalEnvelope> {
    return this.rpc<ApprovalEnvelope>('approval.get', { approvalId });
  }
}
