import { SubClient } from './base';

/**
 * Further fields a method accepts beyond the identifiers it needs to route: the REST route's query
 * values or body fields, spelled as the route spells them.
 */
export type RpcExtraParams = Record<string, unknown>;

/**
 * One typed method per JSON-RPC method that no other sub-client reaches by name. Each call posts the
 * named method to the node's JSON-RPC endpoint and returns the node's answer UNTOUCHED, typed as the
 * caller says (`T`, default `unknown`): this client names no key of any answer, because a shape it
 * invented would be an assertion about the node it does not own. The identifiers a method needs are
 * required, typed fields; everything else goes in the same object.
 *
 * The caller's disclosure context (actor, purpose, workflowInstance) is merged in by the client's
 * own `rpc`, exactly as for every other sub-client.
 */
export class RpcSubClient extends SubClient {
  /** Walk the anchor chain from an anchor id (JSON-RPC anchor.chain). */
  anchorChain<T = unknown>(params: { startId: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('anchor.chain', { ...params, startId: params.startId });
  }

  /** Read one anchor (JSON-RPC anchor.get). */
  anchorGet<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('anchor.get', { ...params, id: params.id });
  }

  /** Trigger an anchor now (JSON-RPC anchor.manual). */
  anchorManual<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('anchor.manual', params);
  }

  /** Read one approval (JSON-RPC approval.get). */
  approvalGet<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('approval.get', { ...params, id: params.id });
  }

  /** Verify an approval (give the approval in `params`) (JSON-RPC approval.verify). */
  approvalVerify<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('approval.verify', params);
  }

  /** Export the audit trail (filters in `params`) (JSON-RPC audit.export). */
  auditExport<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('audit.export', params);
  }

  /** Query the audit trail (filters in `params`) (JSON-RPC audit.query). */
  auditQuery<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('audit.query', params);
  }

  /** Check a capability grant (subject and capability in `params`) (JSON-RPC capability.check). */
  capabilityCheck<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('capability.check', params);
  }

  /** List capabilities (JSON-RPC capability.list). */
  capabilityList<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('capability.list', params);
  }

  /** Read a contract's capability manifest (JSON-RPC capability.manifest). */
  capabilityManifest<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('capability.manifest', { ...params, contract: params.contract });
  }

  /** List the capability types (JSON-RPC capability.types). */
  capabilityTypes<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('capability.types', params);
  }

  /** Cast a ballot on a committee motion (JSON-RPC committee.castBallot). */
  committeeCastBallot<T = unknown>(params: { id: string; motionId: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('committee.castBallot', { ...params, id: params.id, motionId: params.motionId });
  }

  /** Read a committee's motions (JSON-RPC committee.get). */
  committeeGet<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('committee.get', { ...params, id: params.id });
  }

  /** List a committee's motions (JSON-RPC committee.list). */
  committeeList<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('committee.list', { ...params, id: params.id });
  }

  /** Open a motion before a committee (JSON-RPC committee.openMotion). */
  committeeOpenMotion<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('committee.openMotion', { ...params, id: params.id });
  }

  /** Resolve a committee motion (JSON-RPC committee.resolve). */
  committeeResolve<T = unknown>(params: { id: string; motionId: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('committee.resolve', { ...params, id: params.id, motionId: params.motionId });
  }

  /** Simulate a contract call without committing state (JSON-RPC contract.simulate). */
  contractSimulate<T = unknown>(params: { contract: string; function: string; caller: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('contract.simulate', { ...params, contract: params.contract, function: params.function, caller: params.caller });
  }

  /** Check a disclosure grant (subject and scope in `params`) (JSON-RPC disclosure.check). */
  disclosureCheck<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('disclosure.check', params);
  }

  /** Register a disclosure key (key material in `params`) (JSON-RPC disclosure.registerKey). */
  disclosureRegisterKey<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('disclosure.registerKey', params);
  }

  /** Read one dispute (JSON-RPC dispute.get). */
  disputeGet<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('dispute.get', { ...params, id: params.id });
  }

  /** List disputes (JSON-RPC dispute.list). */
  disputeList<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('dispute.list', params);
  }

  /** Open a dispute case (case in `params`) (JSON-RPC dispute.openCase). */
  disputeOpenCase<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('dispute.openCase', params);
  }

  /** Sign a dispute resolution (JSON-RPC dispute.resolve). */
  disputeResolve<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('dispute.resolve', { ...params, id: params.id });
  }

  /** Route a dispute case (JSON-RPC dispute.routeCase). */
  disputeRouteCase<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('dispute.routeCase', { ...params, id: params.id });
  }

  /** Execute an emergency case (JSON-RPC emergency.execute). */
  emergencyExecute<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('emergency.execute', { ...params, id: params.id });
  }

  /** Read emergency cases (filters in `params`) (JSON-RPC emergency.get). */
  emergencyGet<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('emergency.get', params);
  }

  /** List emergency cases (JSON-RPC emergency.list). */
  emergencyList<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('emergency.list', params);
  }

  /** Open an emergency case (case in `params`) (JSON-RPC emergency.openCase). */
  emergencyOpenCase<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('emergency.openCase', params);
  }

  /** Sign an emergency case (JSON-RPC emergency.sign). */
  emergencySign<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('emergency.sign', { ...params, id: params.id });
  }

  /** Fund an escrow (JSON-RPC escrow.fund). */
  escrowFund<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('escrow.fund', { ...params, id: params.id });
  }

  /** Refund an escrow (JSON-RPC escrow.refund). */
  escrowRefund<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('escrow.refund', { ...params, id: params.id });
  }

  /** Read a contract's event history (JSON-RPC events.history). */
  eventsHistory<T = unknown>(params: { addr: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('events.history', { ...params, addr: params.addr });
  }

  /** List evidence records (JSON-RPC evidence.list). */
  evidenceList<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('evidence.list', params);
  }

  /** Record a signed approval for a parked stage (JSON-RPC governed.approve). */
  governedApprove<T = unknown>(params: { intentId: string; planHash: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('governed.approve', { ...params, intentId: params.intentId, planHash: params.planHash });
  }

  /** Refuse a pending approval (approval in `params`) (JSON-RPC governed.reject). */
  governedReject<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('governed.reject', params);
  }

  /** Read the governed status of an intent (JSON-RPC governed.status). */
  governedStatus<T = unknown>(params: { intentId: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('governed.status', { ...params, intentId: params.intentId });
  }

  /** Submit a governed intent (JSON-RPC governed.submit). */
  governedSubmit<T = unknown>(params: { goalType: string; actor: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('governed.submit', { ...params, goalType: params.goalType, actor: params.actor });
  }

  /** Record a signed approval for a parked stage (JSON-RPC intent.approve). */
  intentApprove<T = unknown>(params: { intentId: string; planHash: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('intent.approve', { ...params, intentId: params.intentId, planHash: params.planHash });
  }

  /** Withdraw a parked intent (JSON-RPC intent.cancel). */
  intentCancel<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('intent.cancel', { ...params, id: params.id });
  }

  /** Read one intent (JSON-RPC intent.get). */
  intentGet<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('intent.get', { ...params, id: params.id });
  }

  /** Read the status of an intent (JSON-RPC intent.status). */
  intentStatus<T = unknown>(params: { intentId: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('intent.status', { ...params, intentId: params.intentId });
  }

  /** Submit a governed intent (JSON-RPC intent.submit). */
  intentSubmit<T = unknown>(params: { goalType: string; actor: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('intent.submit', { ...params, goalType: params.goalType, actor: params.actor });
  }

  /** Read a contract's alert rules (JSON-RPC mission.alert.rules). */
  missionAlertRules<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.alert.rules', { ...params, contract: params.contract });
  }

  /** Read a contract's alerts (JSON-RPC mission.alerts). */
  missionAlerts<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.alerts', { ...params, contract: params.contract });
  }

  /** Read a contract's dashboard document (JSON-RPC mission.grafana). */
  missionGrafana<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.grafana', { ...params, contract: params.contract });
  }

  /** Read a contract's mission metrics (JSON-RPC mission.metrics). */
  missionMetrics<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.metrics', { ...params, contract: params.contract });
  }

  /** Read a contract's service-level objectives (JSON-RPC mission.slo). */
  missionSlo<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.slo', { ...params, contract: params.contract });
  }

  /** Read a contract's service-level objective status (JSON-RPC mission.slo.status). */
  missionSloStatus<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.slo.status', { ...params, contract: params.contract });
  }

  /** Read the trace of a transaction (JSON-RPC mission.trace). */
  missionTrace<T = unknown>(params: { tx_hash: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('mission.trace', { ...params, tx_hash: params.tx_hash });
  }

  /** Read the chain identifier (JSON-RPC network.chainId). */
  networkChainId<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('network.chainId', params);
  }

  /** Read the node's block height and sync state (JSON-RPC network.status). */
  networkStatus<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('network.status', params);
  }

  /** Transition a governed object (JSON-RPC object.transition). */
  objectTransition<T = unknown>(params: { type: string; id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('object.transition', { ...params, type: params.type, id: params.id });
  }

  /** Bind a policy (binding in `params`) (JSON-RPC policy.bind). */
  policyBind<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('policy.bind', params);
  }

  /** List recent policy decisions (JSON-RPC policy.decisions). */
  policyDecisions<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('policy.decisions', params);
  }

  /** Evaluate a policy question (type, scope and operands in `params`) (JSON-RPC policy.evaluate). The typed REST client is `policies.evaluate`. */
  policyEvaluate<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('policy.evaluate', params);
  }

  /** Simulate a policy decision (type, scope and operands in `params`) (JSON-RPC policy.simulate). The typed REST client is `policies.simulate`. */
  policySimulate<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('policy.simulate', params);
  }

  /** Read one policy rule (JSON-RPC policy.get). */
  policyGet<T = unknown>(params: { ruleId: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('policy.get', { ...params, ruleId: params.ruleId });
  }

  /** List policies (JSON-RPC policy.list). */
  policyList<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('policy.list', params);
  }

  /** Assign an emergency role (assignment in `params`) (JSON-RPC role.emergency). */
  roleEmergency<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('role.emergency', params);
  }

  /** Read the roles of an identity (JSON-RPC role.get). */
  roleGet<T = unknown>(params: { identity: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('role.get', { ...params, identity: params.identity });
  }

  /** List pending settlements (JSON-RPC settlement.pending). */
  settlementPending<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('settlement.pending', params);
  }

  /** Simulate a shape change for a contract (JSON-RPC shapes.simulate). */
  shapesSimulate<T = unknown>(params: { contract: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('shapes.simulate', { ...params, contract: params.contract });
  }

  /** Create a swarm (definition in `params`) (JSON-RPC swarm.create). */
  swarmCreate<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('swarm.create', params);
  }

  /** Create a trust profile (profile in `params`) (JSON-RPC trust.create). */
  trustCreate<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('trust.create', params);
  }

  /** Read the trust dashboard (JSON-RPC trust.dashboard). */
  trustDashboard<T = unknown>(params: RpcExtraParams = {}): Promise<T> {
    return this.rpc<T>('trust.dashboard', params);
  }

  /** Read a trust profile's history (JSON-RPC trust.history). */
  trustHistory<T = unknown>(params: { id: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('trust.history', { ...params, id: params.id });
  }

  /** Read one transaction (JSON-RPC tx.get). */
  txGet<T = unknown>(params: { txHash: string } & RpcExtraParams): Promise<T> {
    return this.rpc<T>('tx.get', { ...params, txHash: params.txHash });
  }
}
