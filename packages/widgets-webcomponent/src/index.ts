// @infrix/widgets-webcomponent — Embedded Verification Web Components (nextux-09).
//
// Importing this module (or the CDN bundle) registers <infrix-proof-receipt> and
// <infrix-verify-button>. No React, no node trust, no network by default.

export {
  InfrixProofReceiptElement,
  InfrixVerifyButtonElement,
  defineElements,
  ELEMENT_TAGS,
} from './elements.js';
export {
  renderReceiptHTML,
  renderVerifyResultHTML,
  renderErrorHTML,
} from './render.js';
export type { RenderOptions } from './render.js';

import { defineElements } from './elements.js';

// Auto-register on import (side effect). Safe in non-DOM environments.
defineElements();
