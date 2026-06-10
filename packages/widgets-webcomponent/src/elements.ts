// @infrix/widgets-webcomponent — framework-neutral custom elements (nextux-09).
//
// <infrix-proof-receipt> and <infrix-verify-button> verify a proof IN THE
// BROWSER with no node trust and no React, reusing the same verifier core as the
// React kit. Nothing leaves the page unless an `l0` endpoint is supplied.
//
// The module loads safely in non-DOM environments (Base falls back to a plain
// class) so it can be imported in tests; the elements only function in a browser.

import { verifyBundle } from '@infrix/widgets/verifier';
import type { VerifyResult } from '@infrix/widgets/verifier';
import { ensureStyles } from '@infrix/widgets/styles';
import { renderReceiptHTML, renderVerifyResultHTML, renderErrorHTML, escapeHtml } from './render.js';

const Base: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

function opts(el: Element): { theme?: 'light' | 'dark' | 'auto'; variant?: 'full' | 'compact' } {
  return {
    theme: (el.getAttribute('theme') as 'light' | 'dark' | 'auto') || 'auto',
    variant: (el.getAttribute('variant') as 'full' | 'compact') || 'full',
  };
}

async function loadBundle(el: HTMLElement): Promise<unknown> {
  const inline = (el as unknown as { bundle?: unknown }).bundle;
  if (inline != null) return inline;
  const src = el.getAttribute('src');
  if (src) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`could not load proof (${res.status})`);
    return res.json();
  }
  throw new Error('no "src" attribute or "bundle" property provided');
}

/** <infrix-proof-receipt src="/proof.infrix.json" [l0=…] [theme] [variant]>.
 *  Verifies the bundle and renders the receipt; emits `verify` / `error`. */
export class InfrixProofReceiptElement extends Base {
  async connectedCallback(): Promise<void> {
    ensureStyles();
    this.innerHTML = '<div class="iw-widget" role="status">Verifying…</div>';
    try {
      const bundle = await loadBundle(this as unknown as HTMLElement);
      const l0 = this.getAttribute('l0') || undefined;
      const result = await verifyBundle(bundle, { l0 });
      this.innerHTML = renderReceiptHTML(result, opts(this));
      this.dispatchEvent(new CustomEvent<VerifyResult>('verify', { detail: result, bubbles: true }));
    } catch (err) {
      this.innerHTML = renderErrorHTML('Could not verify this proof.', opts(this));
      this.dispatchEvent(new CustomEvent('error', { detail: err, bubbles: true }));
    }
  }
}

/** <infrix-verify-button src="/proof.infrix.json" [l0] [label]>. Renders a button
 *  that verifies on click and shows the honest result inline. */
export class InfrixVerifyButtonElement extends Base {
  connectedCallback(): void {
    ensureStyles();
    const label = this.getAttribute('label') || 'Verify proof';
    this.innerHTML =
      `<div class="iw-widget iw-widget-verify" data-theme="${escapeHtml(this.getAttribute('theme') || 'auto')}"` +
      ` data-variant="${escapeHtml(this.getAttribute('variant') || 'full')}" role="group" aria-label="Verify proof">` +
      `<button type="button" class="iw-btn">${escapeHtml(label)}</button>` +
      `<div class="iw-verify-slot"></div></div>`;
    const btn = this.querySelector('button');
    btn?.addEventListener('click', () => void this.run());
  }

  async run(): Promise<void> {
    const slot = this.querySelector('.iw-verify-slot') as HTMLElement | null;
    const btn = this.querySelector('button') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }
    try {
      const bundle = await loadBundle(this as unknown as HTMLElement);
      const result = await verifyBundle(bundle, { l0: this.getAttribute('l0') || undefined });
      if (slot) slot.innerHTML = renderVerifyResultHTML(result, opts(this));
      this.dispatchEvent(new CustomEvent<VerifyResult>('verify', { detail: result, bubbles: true }));
    } catch (err) {
      if (slot) slot.innerHTML = renderErrorHTML('Verification failed.', opts(this));
      this.dispatchEvent(new CustomEvent('error', { detail: err, bubbles: true }));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
  }
}

export const ELEMENT_TAGS = {
  receipt: 'infrix-proof-receipt',
  verifyButton: 'infrix-verify-button',
} as const;

/** defineElements registers the custom elements. It is a no-op when the
 *  Custom Elements API is unavailable (e.g. in Node), so importing this module
 *  never throws. */
export function defineElements(): void {
  if (typeof customElements === 'undefined') return;
  if (!customElements.get(ELEMENT_TAGS.receipt)) customElements.define(ELEMENT_TAGS.receipt, InfrixProofReceiptElement);
  if (!customElements.get(ELEMENT_TAGS.verifyButton)) customElements.define(ELEMENT_TAGS.verifyButton, InfrixVerifyButtonElement);
}
