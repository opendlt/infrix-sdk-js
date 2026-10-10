import { SubClient } from './base';
import type {
  ApprovalEnvelope,
  ApprovalListFilter,
  ApprovalSigningRequest,
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
   * Fetch what the caller must sign to approve a parked stage. The approving
   * identity is the asserted actor; the material is bound to it, the role and
   * the key page. Recompute the digest from the fields before signing
   * (@infrix/wallet bindApprovalSigningRequest does this).
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
    return this.rpc<ApprovalSigningRequest>('approval.signing', {
      intentId,
      keyPageRef,
      ...(opts ?? {}),
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
