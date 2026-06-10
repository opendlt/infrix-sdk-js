// @infrix/widgets-webcomponent — pure HTML renderers (nextux-09).
//
// These produce the SAME honest markup the React widgets render, reusing the
// React-free verifier core + canonical badges from @infrix/widgets. They are
// pure string functions so they can be tested without a DOM.

import type { VerifyResult } from '@infrix/widgets/verifier';
import { canonicalBadges } from '@infrix/widgets/verifier';

export interface RenderOptions {
  theme?: 'light' | 'dark' | 'auto';
  variant?: 'full' | 'compact';
}

export function escapeHtml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell(kind: string, ariaLabel: string, opts: RenderOptions, inner: string): string {
  return (
    `<div class="iw-widget iw-widget-${kind}" data-theme="${escapeHtml(opts.theme || 'auto')}"` +
    ` data-variant="${escapeHtml(opts.variant || 'full')}" role="group" aria-label="${escapeHtml(ariaLabel)}">${inner}</div>`
  );
}

function statusWord(status: string): string {
  return status === 'verified' ? 'Verified' : status === 'partial' ? 'Partially verified' : 'Not verified';
}

function badgesHtml(result: VerifyResult): string {
  const list = canonicalBadges(result);
  if (!list.length) return '';
  const items = list
    .map(
      (b) =>
        `<li class="iw-badge" data-on="true" data-role="${escapeHtml(b.colorRole || 'neutral')}"` +
        ` aria-label="${escapeHtml(b.screenReader || b.short)}" title="${escapeHtml(b.plain || b.short)}">${escapeHtml(b.short)}</li>`,
    )
    .join('');
  return `<ul class="iw-badges" aria-label="Assurance">${items}</ul>`;
}

function l0Text(r: VerifyResult): string {
  if (r.l0Verified) return `confirmed${r.network ? ' on ' + escapeHtml(r.network) : ''}`;
  return r.l0Checked ? 'not confirmed' : 'not checked (offline)';
}

/** renderReceiptHTML renders a proof-receipt card. */
export function renderReceiptHTML(result: VerifyResult, opts: RenderOptions = {}): string {
  const warns = result.warnings.length
    ? `<ul class="iw-warnings">${result.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
    : '';
  const inner =
    `<h3 class="iw-title">Proof receipt</h3>` +
    `<span class="iw-status" data-status="${escapeHtml(result.status)}" role="status">${statusWord(result.status)}</span>` +
    `<p class="iw-honest">${escapeHtml(result.honestLabel)}</p>` +
    `<dl class="iw-grid">` +
    `<dt>Assurance</dt><dd>${escapeHtml(result.label || '—')}</dd>` +
    `<dt>Trusts node</dt><dd>${result.nodeTrusted ? 'yes' : 'no'}</dd>` +
    `<dt>L0 anchor</dt><dd>${l0Text(result)}</dd>` +
    `</dl>` +
    badgesHtml(result) +
    warns;
  return shell('receipt', 'Proof receipt', opts, inner);
}

/** renderVerifyResultHTML renders the inline result of a verify action. */
export function renderVerifyResultHTML(result: VerifyResult, opts: RenderOptions = {}): string {
  const inner =
    `<span class="iw-status" data-status="${escapeHtml(result.status)}" role="status">${statusWord(result.status)}</span>` +
    `<p class="iw-honest">${escapeHtml(result.honestLabel)}</p>` +
    badgesHtml(result);
  return shell('verify', 'Verification result', opts, inner);
}

/** renderErrorHTML renders a generic verification error. */
export function renderErrorHTML(message: string, opts: RenderOptions = {}): string {
  const inner = `<p class="iw-status" data-status="failed" role="alert">${escapeHtml(message || 'Verification failed.')}</p>`;
  return shell('verify', 'Verification error', opts, inner);
}
