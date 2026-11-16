// THE STORED FORM OF A CROSS-METHOD ALIAS BINDING (infrix core part 25g: VerifyStoredAliasBinding, rule for rule; infrix-verify didchain/derive.go verifyStoredBinding). A statement
// carries the binding itself; the alias must be a did:key (its identifier IS its Ed25519 Multikey), the binding must name the alias and the document's own DID, its nonce is at least 16
// characters, foreignKeyId is <did>#<identifier>, and foreignProofValue is that key's Ed25519 signature of the binding statement (the four lines "infrix-alias-binding/v1", infrixDid,
// foreignDid, nonce). An infrixProofValue, when present, verifies under the document's authentication key infrixKeyId. A did:web or did:pkh alias is refused by name.

import { ed25519 } from '@noble/curves/ed25519';
import { JValue } from './canonicalJson';
import { base58Decode } from './accounts';

const NEWLINE = String.fromCharCode(10);

function ed25519Multikey(mb: unknown): Uint8Array | null {
  if (typeof mb !== 'string' || !mb.startsWith('z')) return null;
  const raw = base58Decode(mb.slice(1));
  return raw && raw.length === 34 && raw[0] === 0xed && raw[1] === 0x01 ? raw.slice(2) : null;
}

function b64(s: unknown): Uint8Array | null {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) return null;
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Verify a stored binding for the alias identifier against the document it is added to; throws with the reason when it does not verify. */
export function verifyStoredBinding(binding: Map<string, JValue> | undefined, identifier: string, doc: Map<string, JValue>, refuse: (m: string) => never): void {
  if (!binding) refuse(`${identifier} is a DID of another method and needs a verified binding`);
  const str = (name: string): string => {
    const v = binding!.get(name);
    return typeof v === 'string' ? v : '';
  };
  const foreign = str('foreignDid');
  const infrix = str('infrixDid');
  const nonce = str('nonce');
  if (foreign !== identifier) refuse(`the binding names ${foreign}, not the alias ${identifier}`);
  if (infrix !== doc.get('id')) refuse(`the binding names the Infrix DID ${infrix}, not the document's`);
  if (nonce.length < 16) refuse("the binding's nonce is shorter than 16 characters");
  if (!foreign.startsWith('did:key:')) refuse(`${foreign}: a stored binding verifies only a did:key, whose identifier is its key`);
  const multikey = foreign.slice('did:key:'.length);
  const key = ed25519Multikey(multikey);
  if (!key) return refuse(`the did:key ${foreign} is not an Ed25519 Multikey`);
  if (str('foreignKeyId') !== `${foreign}#${multikey}`) refuse("the foreign key is not the did:key's own key");
  const statement = new TextEncoder().encode(['infrix-alias-binding/v1', infrix, foreign, nonce].join(NEWLINE));
  const verify = (sig: Uint8Array | null, pub: Uint8Array): boolean => {
    try {
      return sig !== null && sig.length === 64 && ed25519.verify(sig, statement, pub, { zip215: false });
    } catch {
      return false;
    }
  };
  if (!verify(b64(str('foreignProofValue')), key)) refuse("the foreign controller's signature does not verify");
  if (str('infrixProofValue') !== '') {
    const keyID = str('infrixKeyId');
    const auth = doc.get('authentication');
    const refs = typeof auth === 'string' ? [auth] : Array.isArray(auth) ? auth : [];
    const vm = ((doc.get('verificationMethod') as JValue[] | undefined) ?? [])
      .map((m) => (m as { obj: Map<string, JValue> }).obj)
      .find((m) => m.get('id') === keyID);
    const infrixKey = refs.includes(keyID) && vm ? ed25519Multikey(vm.get('publicKeyMultibase')) : null;
    if (!infrixKey || !verify(b64(str('infrixProofValue')), infrixKey)) refuse("the Infrix controller's signature does not verify");
  }
}
