// @infrix/widgets — scoped styles (nextux-09).
//
// Every selector is scoped under `.iw-widget` and every class/custom-property is
// `iw-`-prefixed, so the widget cannot collide with a host app's styles, and the
// host's styles cannot bleed into the widget (box-sizing + font are reset on the
// root). Light/dark/compact are driven by `data-theme` / `data-variant` on the
// root, never by global state.

export const WIDGET_STYLES = `
.iw-widget {
  --iw-bg: #ffffff;
  --iw-surface: #f5f7fb;
  --iw-border: #e4e8f0;
  --iw-text: #15192b;
  --iw-text-dim: #5a6280;
  --iw-ok: #18a57b;
  --iw-warn: #c77e00;
  --iw-bad: #d43a6a;
  --iw-accent: #5b47e0;
  --iw-radius: 12px;
  --iw-mono: ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, monospace;
  box-sizing: border-box;
  color: var(--iw-text);
  background: var(--iw-bg);
  border: 1px solid var(--iw-border);
  border-radius: var(--iw-radius);
  padding: 16px;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  max-width: 100%;
}
.iw-widget * { box-sizing: border-box; }
.iw-widget[data-theme="dark"] {
  --iw-bg: #131724;
  --iw-surface: #1b2031;
  --iw-border: #252b40;
  --iw-text: #eceffa;
  --iw-text-dim: #9ba4c2;
  --iw-ok: #4de3b5;
  --iw-warn: #ffc960;
  --iw-bad: #ff6e92;
  --iw-accent: #8f82ff;
}
@media (prefers-color-scheme: dark) {
  .iw-widget[data-theme="auto"] {
    --iw-bg: #131724;
    --iw-surface: #1b2031;
    --iw-border: #252b40;
    --iw-text: #eceffa;
    --iw-text-dim: #9ba4c2;
    --iw-ok: #4de3b5;
    --iw-warn: #ffc960;
    --iw-bad: #ff6e92;
    --iw-accent: #8f82ff;
  }
}
.iw-widget[data-variant="compact"] { padding: 10px 12px; font-size: 13px; }
.iw-title { margin: 0 0 8px; font-size: 1rem; font-weight: 600; }
.iw-widget[data-variant="compact"] .iw-title { margin-bottom: 4px; font-size: 0.92rem; }
.iw-status { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.iw-status[data-status="verified"] { color: var(--iw-ok); }
.iw-status[data-status="partial"] { color: var(--iw-warn); }
.iw-status[data-status="failed"], .iw-status[data-status="unverified"] { color: var(--iw-bad); }
.iw-honest { margin: 6px 0; color: var(--iw-text-dim); font-size: 0.86rem; overflow-wrap: anywhere; }
.iw-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; margin: 8px 0 0; }
.iw-grid dt { color: var(--iw-text-dim); font-size: 0.82rem; }
.iw-grid dd { margin: 0; font-size: 0.82rem; word-break: break-all; }
.iw-badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; padding: 0; list-style: none; }
.iw-badge {
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--iw-border); border-radius: 999px;
  padding: 2px 10px; font-size: 0.74rem; color: var(--iw-text-dim);
}
.iw-badge[data-on="true"][data-role="positive"] { border-color: var(--iw-ok); color: var(--iw-ok); }
.iw-badge[data-on="true"] { border-color: var(--iw-ok); color: var(--iw-ok); }
.iw-badge[data-on="false"] { opacity: 0.85; }
.iw-warnings { margin: 8px 0 0; padding-left: 18px; }
.iw-warnings li { color: var(--iw-warn); font-size: 0.82rem; overflow-wrap: anywhere; }
.iw-btn {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--iw-accent); background: var(--iw-accent); color: #fff;
  border-radius: 8px; padding: 8px 16px; font-size: 0.9rem; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.iw-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.iw-btn-secondary { background: transparent; color: var(--iw-text); }
.iw-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: iw-spin 0.7s linear infinite; }
@keyframes iw-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .iw-spinner { animation: none; } }
.iw-mono { font-family: var(--iw-mono); font-size: 0.78rem; word-break: break-all; }
.iw-steps { margin: 8px 0 0; padding-left: 0; list-style: none; }
.iw-step { display: flex; gap: 8px; padding: 6px 0; border-top: 1px solid var(--iw-border); }
.iw-step:first-child { border-top: 0; }
.iw-step-index { color: var(--iw-text-dim); font-variant-numeric: tabular-nums; min-width: 1.6em; }
.iw-step-label { overflow-wrap: anywhere; }
.iw-task-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.iw-task-trust { font-size: 0.72rem; text-transform: uppercase; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--iw-border); color: var(--iw-text-dim); }
.iw-task-trust[data-trust="official_verified"] { border-color: var(--iw-ok); color: var(--iw-ok); }
.iw-task-cmd { display: block; margin-top: 8px; }
.iw-error { border-left: 3px solid var(--iw-bad); padding-left: 10px; }
.iw-error-title { margin: 0 0 4px; font-weight: 600; color: var(--iw-bad); }
.iw-error-fix { margin: 6px 0 0; }
.iw-hint { color: var(--iw-text-dim); font-size: 0.82rem; overflow-wrap: anywhere; }
@media (max-width: 480px) {
  .iw-widget { padding: 12px; }
  .iw-grid { grid-template-columns: 1fr; }
}
`;

const STYLE_ID = 'infrix-widgets-styles';

/** ensureStyles injects the widget stylesheet once into the document head. It is
 *  a no-op in non-browser environments (e.g. SSR / tests). The host can instead
 *  import `@infrix/widgets/styles.css` if it prefers a linked stylesheet. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = WIDGET_STYLES;
  document.head.appendChild(style);
}
