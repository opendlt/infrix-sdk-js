// Build check: the package imports and exposes its primary factory + helpers.
import * as mod from '../index.js';
for (const name of ['createInfrixMetaMask', 'translateError', 'providerStatus', 'buildChallenge', 'assertChallengeFresh']) {
  if (typeof mod[name] !== 'function') {
    console.error(`@infrix/metamask: build check failed — ${name} missing`);
    process.exit(1);
  }
}
console.log('@infrix/metamask: API ok');
