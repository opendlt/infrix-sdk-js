// Build check: the package imports and exposes its one obvious primary method.
import * as mod from '../index.js';
if (typeof mod.createEscrowApp !== 'function') {
  console.error('@infrix/golden-escrow: build check failed — createEscrowApp missing');
  process.exit(1);
}
console.log('@infrix/golden-escrow: API ok');
