# @infrix/widgets-webcomponent

Framework-neutral **Web Components** for embedding Infrix proof verification —
verified in-browser, no node trust, **no React required**.

```bash
npm install @infrix/widgets-webcomponent
```

```js
import '@infrix/widgets-webcomponent'; // registers the elements
```

```html
<infrix-proof-receipt src="/proof.infrix.json"></infrix-proof-receipt>
<infrix-verify-button src="/proof.infrix.json" label="Verify"></infrix-verify-button>
```

Both elements emit `verify` (with the result in `event.detail`) and `error`
events. Attributes: `src` (proof URL), `l0` (opt-in live-L0 backend URL),
`theme` (`light`/`dark`/`auto`), `variant` (`full`/`compact`), `label`. You can
also set a `.bundle` property in JS instead of `src`.

## CDN

A single self-contained ESM bundle registers the elements:

```html
<script type="module"
  src="https://cdn.infrix.dev/widgets/infrix-widgets.js"
  integrity="sha384-…"
  crossorigin="anonymous"></script>

<infrix-proof-receipt src="/proof.infrix.json"></infrix-proof-receipt>
```

### Subresource Integrity (SRI)

Always pin the bundle with an `integrity` hash so a tampered CDN file is
rejected. The build computes it for you:

```bash
npm run build
# prints:  Subresource Integrity: integrity="sha384-…"
# and writes dist/infrix-widgets.js.sri
```

Copy that exact `sha384-…` value into the `<script integrity="…">` attribute and
add `crossorigin="anonymous"`. Re-generate it whenever you publish a new bundle.

## Honest by construction

Same guarantees as [`@infrix/widgets`](../widgets): verification runs in the
browser, nothing leaves the page unless you pass an `l0` endpoint, an offline
verdict is never inflated to L4 ("Locally verified. Live L0 not checked."), and
no green badge appears unless it was earned. Untrusted proof fields are escaped
before rendering.
