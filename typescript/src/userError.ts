// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

/**
 * Error translation layer — SDK side (adoption-08).
 *
 * The Go `pkg/usererror` package emits one stable error code per failure across
 * the CLI, REST, and RPC surfaces, each carrying a title, why-it-matters
 * impact, concrete fixes, and a docs link. {@link InfrixUserError} is the typed
 * TypeScript mirror of that wire shape, so an SDK consumer catches a failure and
 * reads the *same* guidance — keyed on the *same* stable code — that the CLI
 * prints. This is the source of "CLI and SDK present the same stable code" from
 * the adoption-08 acceptance criteria.
 */

/** One concrete next action, mirroring Go `usererror.Fix`. */
export interface UserErrorFix {
  label: string;
  command?: string;
  safeToRun: boolean;
}

/** The wire shape of a translated error (Go `usererror.UserError` JSON). */
export interface UserErrorPayload {
  code: string;
  title: string;
  message: string;
  cause?: string;
  impact?: string;
  fixes?: UserErrorFix[];
  docs?: string;
  retryable?: boolean;
  supportData?: Record<string, string>;
}

/**
 * Typed, actionable error thrown by the SDK when a server response carries a
 * translated error. It exposes the stable `code` (matching the CLI), the
 * human `title`/`impact`, the `fixes`, the `docs` link, and `retryable`.
 */
export class InfrixUserError extends Error {
  readonly code: string;
  readonly title: string;
  readonly impact?: string;
  readonly cause?: string;
  readonly fixes: UserErrorFix[];
  readonly docs?: string;
  readonly retryable: boolean;
  readonly supportData: Record<string, string>;

  constructor(payload: UserErrorPayload) {
    super(payload.message || payload.title || payload.code);
    this.name = 'InfrixUserError';
    this.code = payload.code;
    this.title = payload.title ?? '';
    this.impact = payload.impact;
    this.cause = payload.cause;
    this.fixes = Array.isArray(payload.fixes) ? payload.fixes : [];
    this.docs = payload.docs;
    this.retryable = payload.retryable === true;
    this.supportData = payload.supportData ?? {};
  }

  /** A multi-line, human-readable rendering parallel to Go's RenderHuman. */
  toHuman(): string {
    const lines: string[] = [`✘ ${this.title}  [${this.code}]`];
    if (this.message) lines.push('', `  ${this.message}`);
    if (this.impact) lines.push('', `  Why it matters: ${this.impact}`);
    if (this.fixes.length) {
      lines.push('', '  Try:');
      for (const f of this.fixes) {
        lines.push(`    • ${f.label}`);
        if (f.command) lines.push(`        ${f.command}`);
      }
    }
    if (this.retryable) lines.push('', '  This is often transient — retrying may succeed.');
    if (this.docs) lines.push('', `  Docs: ${this.docs}`);
    return lines.join('\n');
  }
}

/**
 * True when `code` looks like a stable usererror code (UPPER_SNAKE_CASE), as
 * opposed to a numeric JSON-RPC code.
 */
export function isStableErrorCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code);
}

/**
 * Parse a v4 REST / RPC error envelope into an {@link InfrixUserError}, or
 * return null if the object is not a translated error. Accepts both the
 * top-level v4 `{code, message, details}` envelope (where `details` is the full
 * UserError) and a bare UserError payload.
 */
export function parseUserError(errObj: unknown): InfrixUserError | null {
  if (!errObj || typeof errObj !== 'object') return null;
  const o = errObj as Record<string, unknown>;

  // v4 envelope: the full UserError rides in `details`.
  const details = o.details;
  if (details && typeof details === 'object' && isStableErrorCode((details as Record<string, unknown>).code)) {
    return new InfrixUserError(details as unknown as UserErrorPayload);
  }
  // Bare UserError payload (e.g. from a CLI `--json` capture or RPC `data`).
  if (isStableErrorCode(o.code)) {
    return new InfrixUserError(o as unknown as UserErrorPayload);
  }
  const data = o.data;
  if (data && typeof data === 'object' && isStableErrorCode((data as Record<string, unknown>).code)) {
    return new InfrixUserError(data as unknown as UserErrorPayload);
  }
  return null;
}
