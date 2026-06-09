/**
 * InfrixAgentClient — the TypeScript client for the Agent Action Protocol
 * (nextux-01). It is a thin transport over the `infrix agent serve` HTTP API;
 * it adds no logic the server does not also enforce, and it never holds keys.
 *
 *   const agent = new InfrixAgentClient({ endpoint, sessionToken });
 *   const dry = await agent.dryRun("workflow.execute", input);
 *   const tok = await agent.approve("workflow.execute", input);
 *   const res = await agent.run("workflow.execute", input, { approval: tok });
 *
 * No telemetry is exported by default.
 */

import type {
  AgentResponse,
  ApprovalRequest,
  ApprovalToken,
  Manifest,
  Session,
  SelfTestReport,
} from './actions';

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface InfrixAgentClientOptions {
  /** Base URL of `infrix agent serve`, e.g. http://localhost:8765. */
  endpoint: string;
  /** Session id to run under. Empty uses the server's default local session. */
  sessionToken?: string;
  /** Run under this profile (local|kermit|public_production). */
  profile?: string;
  /** Inject a fetch implementation (defaults to global fetch). */
  fetchImpl?: FetchLike;
}

export interface RunOptions {
  approval?: ApprovalToken | null;
  allowMainnet?: boolean;
  explain?: boolean;
  /**
   * autoApprove runs the dry-run → approve → run sequence in one call. Use only
   * where a human has delegated approval to this session (e.g. a
   * preapproved_local_only session); it does NOT bypass the server gate.
   */
  autoApprove?: boolean;
}

export class InfrixAgentClient {
  private readonly endpoint: string;
  private readonly sessionToken?: string;
  private readonly profile?: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: InfrixAgentClientOptions) {
    if (!opts || !opts.endpoint) {
      throw new Error('InfrixAgentClient: endpoint is required');
    }
    this.endpoint = opts.endpoint.replace(/\/+$/, '');
    this.sessionToken = opts.sessionToken;
    this.profile = opts.profile;
    const f = opts.fetchImpl ?? (globalThis as { fetch?: FetchLike }).fetch;
    if (!f) {
      throw new Error('InfrixAgentClient: no fetch implementation available (pass fetchImpl)');
    }
    this.fetchImpl = f;
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(this.endpoint + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as T) : ({} as T);
    return parsed;
  }

  /** listActions returns every agent-visible manifest. */
  async listActions(): Promise<Manifest[]> {
    const r = await this.req<{ actions: Manifest[] }>('GET', '/agent/actions');
    return r.actions ?? [];
  }

  /** describeAction returns one action's manifest. */
  async describeAction(id: string): Promise<Manifest> {
    return this.req<Manifest>('GET', `/agent/actions/${encodeURIComponent(id)}`);
  }

  /** dryRun previews an action without performing it. */
  async dryRun(action: string, input: Record<string, unknown> = {}, opts: { explain?: boolean } = {}): Promise<AgentResponse> {
    return this.req<AgentResponse>('POST', '/agent/dry-run', {
      action,
      input,
      sessionId: this.sessionToken,
      profile: this.profile,
      explain: opts.explain ?? false,
    });
  }

  /** approve mints an input-bound approval token for an action. */
  async approve(
    action: string | ApprovalRequest,
    input: Record<string, unknown> = {}
  ): Promise<ApprovalToken> {
    const actionId = typeof action === 'string' ? action : action.action;
    const r = await this.req<{ ok: boolean; approval: ApprovalToken; errors?: { code: string; message: string }[] }>(
      'POST',
      '/agent/approve',
      { action: actionId, input, sessionId: this.sessionToken, profile: this.profile }
    );
    if (!r.ok || !r.approval) {
      const code = r.errors && r.errors[0] ? r.errors[0].code : 'AGENT_APPROVAL_INVALID';
      throw new Error(`approve failed: ${code}`);
    }
    return r.approval;
  }

  /** run executes an action under the server's safety gate. */
  async run(action: string, input: Record<string, unknown> = {}, opts: RunOptions = {}): Promise<AgentResponse> {
    let approval = opts.approval ?? null;
    if (opts.autoApprove && !approval) {
      await this.dryRun(action, input);
      approval = await this.approve(action, input);
    }
    return this.req<AgentResponse>('POST', '/agent/run', {
      action,
      input,
      sessionId: this.sessionToken,
      profile: this.profile,
      approval,
      allowMainnet: opts.allowMainnet ?? false,
      explain: opts.explain ?? false,
    });
  }

  /** createSession mints a capability-scoped session. */
  async createSession(opts: {
    ttlSeconds?: number;
    allowedActions?: string[];
    network?: string;
    profile?: string;
    writeBudget?: number;
    approvalMode?: string;
    allowSigning?: boolean;
    callerIdentity?: string;
  } = {}): Promise<Session> {
    return this.req<Session>('POST', '/agent/sessions', opts);
  }

  /** getSession inspects a session (secret redacted). */
  async getSession(id: string): Promise<Session> {
    return this.req<Session>('GET', `/agent/sessions/${encodeURIComponent(id)}`);
  }

  /** revokeSession revokes a session. */
  async revokeSession(id: string): Promise<{ ok: boolean; revoked: string }> {
    return this.req('DELETE', `/agent/sessions/${encodeURIComponent(id)}`);
  }

  /** selfTest runs the server's deterministic self-test. */
  async selfTest(): Promise<SelfTestReport> {
    return this.req<SelfTestReport>('GET', '/agent/self-test');
  }
}
