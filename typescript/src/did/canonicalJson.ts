// THE CANONICAL FORM of did:infrix (infrix core part 25g, row H3; core: pkg/did/statementchain/jcs.go, the source).
//
// Every digest of the method covers JSON in ONE form: RFC 8785 (JCS) with the I-JSON refusals core states, so a verifier in any language reproduces it from the JSON text alone:
//   - no object holds two members of one name (refused: "duplicate-member");
//   - every number is read as the nearest IEEE 754 double; one beyond a double's range is refused ("number-range"); an INTEGER literal (no fraction, no exponent) whose magnitude
//     exceeds 2^53 is accepted only when it is written exactly as the form writes its double, and refused otherwise ("inexact-integer");
//   - members are sorted by their names' UTF-16 code units, no whitespace, strings escaped as RFC 8785 says, numbers written as ECMAScript's Number.prototype.toString writes them;
//   - text that is not exactly one JSON value is refused ("not-json").
// The parser below keeps every number's text and sees every member name, which JSON.parse does not (it rounds numbers and keeps the last of two members silently).

export type CanonicalRefusal = 'not-json' | 'duplicate-member' | 'number-range' | 'inexact-integer';

export class CanonicalJSONError extends Error {
  constructor(public readonly refusal: CanonicalRefusal, message: string) {
    super(message);
    this.name = 'CanonicalJSONError';
  }
}

/** A JSON value as the canonical parser reads it: a number keeps its text. */
export type JValue = null | boolean | string | { num: string } | JValue[] | { obj: Map<string, JValue> };

const NUMBER = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/;
const WHITESPACE = /^[ \t\n\r]$/;

class Parser {
  i = 0;
  constructor(private readonly s: string) {}
  fail(message: string): never {
    throw new CanonicalJSONError('not-json', `the text is not one JSON value: ${message} at ${this.i}`);
  }
  ws(): void {
    // charAt past the end is '', which is no whitespace: the scan stops there without a bound to state
    while (WHITESPACE.test(this.s.charAt(this.i))) this.i++;
  }
  value(): JValue {
    this.ws();
    const c = this.s[this.i];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return this.string();
    if (this.s.startsWith('true', this.i)) return (this.i += 4), true;
    if (this.s.startsWith('false', this.i)) return (this.i += 5), false;
    if (this.s.startsWith('null', this.i)) return (this.i += 4), null;
    const m = NUMBER.exec(this.s.slice(this.i));
    if (!m) this.fail('no value');
    this.i += m[0].length;
    return { num: m[0] };
  }
  object(): JValue {
    this.i++;
    const obj = new Map<string, JValue>();
    this.ws();
    if (this.s[this.i] === '}') return this.i++, { obj };
    for (;;) {
      this.ws();
      if (this.s[this.i] !== '"') this.fail('a member name');
      const name = this.string();
      this.ws();
      if (this.s[this.i] !== ':') this.fail('a colon');
      this.i++;
      const v = this.value();
      if (obj.has(name)) throw new CanonicalJSONError('duplicate-member', `the object holds two members named ${JSON.stringify(name)}`);
      obj.set(name, v);
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === '}') return this.i++, { obj };
      this.fail('a comma or a closing brace');
    }
  }
  array(): JValue {
    this.i++;
    const out: JValue[] = [];
    this.ws();
    if (this.s[this.i] === ']') return this.i++, out;
    for (;;) {
      out.push(this.value());
      this.ws();
      if (this.s[this.i] === ',') { this.i++; continue; }
      if (this.s[this.i] === ']') return this.i++, out;
      this.fail('a comma or a closing bracket');
    }
  }
  string(): string {
    this.i++;
    let out = '';
    for (;;) {
      if (this.i === this.s.length) this.fail('an unterminated string');
      const c = this.s[this.i++];
      if (c === '"') return out;
      if (c < ' ') this.fail('a control character in a string');
      if (c !== '\\') { out += c; continue; }
      const e = this.s[this.i++];
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      if (e in simple) { out += simple[e]; continue; }
      if (e !== 'u' || !/^[0-9a-fA-F]{4}$/.test(this.s.slice(this.i, this.i + 4))) this.fail('an invalid escape');
      out += String.fromCharCode(parseInt(this.s.slice(this.i, this.i + 4), 16));
      this.i += 4;
    }
  }
}

/** Parse JSON text into the canonical parser's values, refusing what is not one JSON value and an object with two members of one name. */
export function parseJSON(text: string): JValue {
  const p = new Parser(text);
  const v = p.value();
  p.ws();
  if (p.i !== text.length) p.fail('more than one JSON value');
  return v;
}

/** The canonical spelling of a JSON number's text (refused when beyond a double's range, or an integer above 2^53 that is not its double's spelling). */
export function canonicalNumber(text: string): string {
  if (NUMBER.exec(text)?.[0] !== text) throw new CanonicalJSONError('not-json', `${JSON.stringify(text)} is not a JSON number`);
  const n = Number(text);
  if (!Number.isFinite(n)) throw new CanonicalJSONError('number-range', `the number ${text} is beyond the range of a double`);
  const canonical = String(n); // ECMAScript's Number.prototype.toString, negative zero written 0
  // an integer literal whose text is not its double's spelling is refused: every integer up to 2^53 is spelled by its digits, so these are the integers above 2^53
  // their double does not spell, and "-0" (the number 0, spelled "0"), which is read (core's rule, part 25i)
  if (!/[.eE]/.test(text) && text !== canonical && text !== '-0') {
    throw new CanonicalJSONError('inexact-integer', `the integer ${text} is above 2^53 and is not the canonical spelling of its double (${canonical})`);
  }
  return canonical;
}

function writeString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\r') out += '\\r';
    else if (code < 0x20) out += '\\u' + code.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

/** Write a parsed value in the canonical form. */
export function writeCanonical(v: JValue): string {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'string') return writeString(v);
  if (Array.isArray(v)) return '[' + v.map(writeCanonical).join(',') + ']';
  if ('num' in v) return canonicalNumber(v.num);
  // the default sort orders strings by their UTF-16 code units, RFC 8785's member order (a member name is unique, so no two compare equal)
  const names = [...v.obj.keys()].sort();
  return '{' + names.map((n) => writeString(n) + ':' + writeCanonical(v.obj.get(n)!)).join(',') + '}';
}

/** The RFC 8785 canonical form of JSON text, as UTF-8 bytes (a lone surrogate is written as U+FFFD, as core's encoder writes an invalid byte). */
export function canonicalizeJSON(text: string): Uint8Array {
  return new TextEncoder().encode(writeCanonical(parseJSON(text)));
}
