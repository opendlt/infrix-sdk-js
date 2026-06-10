# @infrix/widgets

Embed Infrix proof verification, receipts, Cinema replay, task cards, and
trust-boundary explanations in your app — **verified in-browser, with no node
trust by default.**

```bash
npm install @infrix/widgets
```

```tsx
import {
  InfrixProofReceipt,
  InfrixVerifyButton,
  InfrixCinemaReplay,
  InfrixTrustBoundary,
  InfrixProofStory,
  InfrixTaskCard,
  InfrixErrorResolution,
} from '@infrix/widgets';

<InfrixProofReceipt bundle={bundle} />
<InfrixVerifyButton bundleUrl="/proof.infrix.json" onVerify={(r) => console.log(r.status)} />
<InfrixCinemaReplay story={story} />
<InfrixTrustBoundary receipt={receipt} />
```

`react` and `react-dom` (>= 18) are peer dependencies. A framework-neutral Web
Component build lives in [`@infrix/widgets-webcomponent`](../widgets-webcomponent).

## Honest by construction

- **Verification runs in the browser.** Nothing is sent anywhere unless you
  explicitly pass an `l0` verification endpoint — by default no proof payload
  leaves the page.
- **An offline verdict is never inflated to L4.** Reaching L4 requires confirming
  the L0 anchor; without it the widget says *"Locally verified. Live L0 not
  checked."* and never *"Fully verified."*
- **No green badge unless it was earned.** Assurance badges are data-gated by the
  same canonical UX label fixture Nexus and the SDK use — a failed verification,
  or an operator-attested-only state, shows no positive badge.
- **No node trust.** Every receipt is built with `nodeTrusted: false`.

## Every component supports

`theme` (`light` | `dark` | `auto`), `variant` (`full` | `compact`), mobile
layout, accessibility labels, `onVerify`, `onError`, and **no external telemetry**.
Styles are injected once under a scoped `.iw-widget` root (every class is
`iw-`-prefixed) so they cannot collide with — or be broken by — your app's CSS.
You can instead link the stylesheet:

```ts
import '@infrix/widgets/styles.css';
```

## Live L0 verification

By default the widgets verify the offline cryptographic structure. To confirm the
L0 anchor live, pass `l0` — a verification-backend URL you control (e.g. an
`infrix verify` service). The bundle is POSTed to it ONLY then:

```tsx
<InfrixProofReceipt bundle={bundle} l0="https://verify.example/l0" />
```

The endpoint must return `{ "l0Verified": boolean, "network"?: string }`.

## The verifier core

The framework-neutral verifier is exported for non-React use:

```ts
import { verifyBundle, verifyStory, verifyReceiptResult } from '@infrix/widgets/verifier';
const result = await verifyStory(shareBundle);
console.log(result.honestLabel); // "Locally verified. Live L0 not checked."
```
