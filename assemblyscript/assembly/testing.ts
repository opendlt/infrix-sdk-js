/**
 * Infrix Contract Testing Framework for AssemblyScript
 *
 * Provides a `describe`/`it` test structure that mirrors popular testing
 * libraries. Test functions prefixed with `test_` are automatically discovered
 * and executed by `infrix contract test`.
 *
 * @example
 * ```typescript
 * import { describe, it, expect, TestContext } from "@infrix/sdk/testing";
 *
 * describe("Counter", () => {
 *   it("should start at zero", () => {
 *     expect(getCount()).toBe(0);
 *   });
 *
 *   it("should increment", () => {
 *     increment();
 *     expect(getCount()).toBe(1);
 *   });
 * });
 * ```
 */

// ---- Test Registry ----

/** A single test case. */
class TestEntry {
  suite: string;
  name: string;
  fn: () => void;

  constructor(suite: string, name: string, fn: () => void) {
    this.suite = suite;
    this.name = name;
    this.fn = fn;
  }
}

/** Test result record. */
export class TestResult {
  name: string;
  passed: bool;
  error: string;
  gasUsed: u64;
  durationMs: f64;

  constructor(name: string) {
    this.name = name;
    this.passed = true;
    this.error = "";
    this.gasUsed = 0;
    this.durationMs = 0;
  }
}

// Global test state.
let _tests: TestEntry[] = [];
let _currentSuite: string = "";
let _results: TestResult[] = [];
let _currentResult: TestResult | null = null;

// ---- describe / it ----

/**
 * Groups related tests under a named suite.
 *
 * ```typescript
 * describe("Token", () => {
 *   it("should transfer", () => { ... });
 * });
 * ```
 */
export function describe(suiteName: string, fn: () => void): void {
  const prev = _currentSuite;
  _currentSuite = suiteName;
  fn();
  _currentSuite = prev;
}

/**
 * Defines a single test case.
 *
 * ```typescript
 * it("should return 42", () => {
 *   expect(getValue()).toBe(42);
 * });
 * ```
 */
export function it(testName: string, fn: () => void): void {
  const fullName = _currentSuite !== "" ? _currentSuite + " > " + testName : testName;
  _tests.push(new TestEntry(_currentSuite, fullName, fn));
}

/**
 * Alias for `it` — for developers who prefer `test("...")`.
 */
export function test(testName: string, fn: () => void): void {
  it(testName, fn);
}

// ---- Expect / Assertions ----

/**
 * Expectation wrapper for fluent assertions.
 *
 * ```typescript
 * expect(42).toBe(42);
 * expect(value).toBeGreaterThan(0);
 * expect(flag).toBeTruthy();
 * ```
 */
export class Expect<T> {
  private actual: T;
  private negated: bool;

  constructor(actual: T, negated: bool = false) {
    this.actual = actual;
    this.negated = negated;
  }

  /** Negate the next assertion. */
  get not(): Expect<T> {
    return new Expect<T>(this.actual, true);
  }

  /** Assert strict equality. */
  toBe(expected: T): void {
    const pass = this.actual == expected;
    if (this.negated ? pass : !pass) {
      fail(`expected ${this.negated ? "not " : ""}${expected}, got ${this.actual}`);
    }
  }

  /** Assert the value is truthy (non-zero, non-null, non-empty). */
  toBeTruthy(): void {
    const pass = !!this.actual;
    if (this.negated ? pass : !pass) {
      fail(`expected ${this.negated ? "falsy" : "truthy"}, got ${this.actual}`);
    }
  }

  /** Assert the value is falsy. */
  toBeFalsy(): void {
    const pass = !this.actual;
    if (this.negated ? pass : !pass) {
      fail(`expected ${this.negated ? "truthy" : "falsy"}, got ${this.actual}`);
    }
  }
}

/**
 * Create an expectation for a value. Use with `.toBe()`, `.toBeTruthy()`, etc.
 */
export function expect<T>(actual: T): Expect<T> {
  return new Expect<T>(actual);
}

// ---- Numeric Assertions (non-generic) ----

/** Assert two i32 values are equal. */
export function assertEq(actual: i32, expected: i32, message: string = ""): void {
  if (actual != expected) {
    const msg = message != ""
      ? message + ` (expected ${expected}, got ${actual})`
      : `expected ${expected}, got ${actual}`;
    fail(msg);
  }
}

/** Assert two i64 values are equal. */
export function assertEq64(actual: i64, expected: i64, message: string = ""): void {
  if (actual != expected) {
    const msg = message != ""
      ? message + ` (expected ${expected}, got ${actual})`
      : `expected ${expected}, got ${actual}`;
    fail(msg);
  }
}

/** Assert a condition is true. */
export function assertTrue(condition: bool, message: string = ""): void {
  if (!condition) {
    fail(message != "" ? message : "expected true, got false");
  }
}

/** Assert a condition is false. */
export function assertFalse(condition: bool, message: string = ""): void {
  if (condition) {
    fail(message != "" ? message : "expected false, got true");
  }
}

// ---- Fail ----

/** Fail the current test with a message. */
export function fail(message: string): void {
  if (_currentResult != null) {
    _currentResult!.passed = false;
    _currentResult!.error = message;
  }
  // In WASM mode this would call host_test_fail which traps.
  // In pure AS mode we record the failure.
  unreachable();
}

// ---- Test Context ----

/**
 * TestContext provides access to the simulated chain for contract tests.
 *
 * In WASM mode, operations dispatch to the Go test harness via host imports.
 * In pure AS mode, a mock context is used.
 */
export class TestContext {
  private _blockHeight: u64 = 0;
  private _blockTime: u64 = 1700000000;
  private _caller: string = "acc://test.acme/alice";

  /** Get the current simulated block height. */
  get blockHeight(): u64 { return this._blockHeight; }

  /** Get the current simulated block time (Unix seconds). */
  get blockTime(): u64 { return this._blockTime; }

  /** Get the current caller identity. */
  get caller(): string { return this._caller; }

  /** Set the caller for subsequent operations. */
  setCaller(url: string): void { this._caller = url; }

  /** Advance the chain by N blocks. */
  advanceBlocks(count: u64): void {
    this._blockHeight += count;
    this._blockTime += count;
  }

  /** Advance the block time by N seconds. */
  advanceTime(seconds: u64): void {
    this._blockTime += seconds;
  }
}

// Global context instance.
export const ctx = new TestContext();

// ---- Test Runner ----

/**
 * Runs all registered tests and returns results.
 * Called by `infrix contract test` via the exported `test_run_all` function.
 */
export function runTests(): TestResult[] {
  _results = [];

  for (let i = 0; i < _tests.length; i++) {
    const entry = _tests[i];
    const result = new TestResult(entry.name);
    _currentResult = result;

    // Each test runs and either completes (pass) or traps (fail).
    // In WASM, a trap means the test failed. We can't catch traps in AS,
    // so the Go runner handles this by calling each test function individually.
    entry.fn();

    _results.push(result);
  }

  _currentResult = null;
  return _results;
}

/** Get the number of registered tests. */
export function testCount(): i32 {
  return _tests.length;
}

/** Get a test name by index. */
export function getTestName(index: i32): string {
  if (index >= 0 && index < _tests.length) {
    return _tests[index].name;
  }
  return "";
}

// ---- Summary (exported for infrix contract test discovery) ----

/**
 * Returns a formatted test summary string.
 */
export function testSummary(): string {
  let passed = 0;
  let failed = 0;
  for (let i = 0; i < _results.length; i++) {
    if (_results[i].passed) passed++;
    else failed++;
  }
  return `${passed} passed, ${failed} failed`;
}

// Re-export for convenience.
export { _tests as registeredTests };
