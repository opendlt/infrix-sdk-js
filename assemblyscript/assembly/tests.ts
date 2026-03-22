// Infrix AssemblyScript SDK Tests

import {
    U256,
    Hash,
    Address,
    Topic,
    ErrorCode,
} from "./types";

// Test results storage
let passCount: i32 = 0;
let failCount: i32 = 0;
const testResults: string[] = [];

function assert(condition: bool, message: string): void {
    if (condition) {
        passCount++;
        testResults.push("PASS: " + message);
    } else {
        failCount++;
        testResults.push("FAIL: " + message);
    }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual == expected) {
        passCount++;
        testResults.push("PASS: " + message);
    } else {
        failCount++;
        testResults.push("FAIL: " + message + " - expected " + expected.toString() + ", got " + actual.toString());
    }
}

// =============================================================================
// U256 Tests
// =============================================================================

export function testU256Zero(): void {
    const zero = U256.zero();
    assert(zero.isZero(), "U256.zero() should be zero");
}

export function testU256One(): void {
    const one = U256.one();
    assert(!one.isZero(), "U256.one() should not be zero");
    assertEqual(one.low0, 1, "U256.one() low0 should be 1");
    assertEqual(one.low1, 0, "U256.one() low1 should be 0");
    assertEqual(one.high0, 0, "U256.one() high0 should be 0");
    assertEqual(one.high1, 0, "U256.one() high1 should be 0");
}

export function testU256FromU64(): void {
    const value = U256.fromU64(12345);
    assertEqual(value.low0, 12345, "fromU64(12345) should have low0 = 12345");
    assert(!value.isZero(), "fromU64(12345) should not be zero");
}

export function testU256FromU64Max(): void {
    const value = U256.fromU64(u64.MAX_VALUE);
    assertEqual(value.low0, u64.MAX_VALUE, "fromU64(MAX) should have low0 = MAX");
    assertEqual(value.low1, 0, "fromU64(MAX) should have low1 = 0");
}

export function testU256Addition(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(50);
    const sum = a.add(b);
    assertEqual(sum.low0, 150, "100 + 50 should equal 150");
}

export function testU256AdditionWithCarry(): void {
    const a = U256.fromU64(u64.MAX_VALUE);
    const b = U256.fromU64(1);
    const sum = a.add(b);
    assertEqual(sum.low0, 0, "MAX + 1 should have low0 = 0");
    assertEqual(sum.low1, 1, "MAX + 1 should have low1 = 1");
}

export function testU256Subtraction(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(30);
    const diff = a.sub(b);
    assertEqual(diff.low0, 70, "100 - 30 should equal 70");
}

export function testU256SubtractionWithBorrow(): void {
    const a = new U256();
    a.low0 = 0;
    a.low1 = 1;
    const b = U256.fromU64(1);
    const diff = a.sub(b);
    assertEqual(diff.low0, u64.MAX_VALUE, "Subtraction with borrow should work");
    assertEqual(diff.low1, 0, "Subtraction should reduce low1");
}

export function testU256Multiplication(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(200);
    const prod = a.mul(b);
    assertEqual(prod.low0, 20000, "100 * 200 should equal 20000");
}

export function testU256MultiplicationByZero(): void {
    const a = U256.fromU64(12345);
    const b = U256.zero();
    const prod = a.mul(b);
    assert(prod.isZero(), "Multiplication by zero should give zero");
}

export function testU256MultiplicationByOne(): void {
    const a = U256.fromU64(12345);
    const b = U256.one();
    const prod = a.mul(b);
    assertEqual(prod.low0, 12345, "Multiplication by one should give same value");
}

export function testU256Division(): void {
    const a = U256.fromU64(1000);
    const b = U256.fromU64(10);
    const quot = a.div(b);
    assertEqual(quot.low0, 100, "1000 / 10 should equal 100");
}

export function testU256DivisionByOne(): void {
    const a = U256.fromU64(12345);
    const b = U256.one();
    const quot = a.div(b);
    assertEqual(quot.low0, 12345, "Division by one should give same value");
}

export function testU256DivisionSmallerByLarger(): void {
    const a = U256.fromU64(5);
    const b = U256.fromU64(10);
    const quot = a.div(b);
    assert(quot.isZero(), "5 / 10 should equal 0");
}

export function testU256ComparisonEqual(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(100);
    assert(a.eq(b), "Equal values should be equal");
}

export function testU256ComparisonLessThan(): void {
    const a = U256.fromU64(50);
    const b = U256.fromU64(100);
    assert(a.lt(b), "50 should be less than 100");
    assert(!b.lt(a), "100 should not be less than 50");
}

export function testU256ComparisonGreaterThan(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(50);
    assert(a.gt(b), "100 should be greater than 50");
    assert(!b.gt(a), "50 should not be greater than 100");
}

export function testU256ComparisonLessThanOrEqual(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(100);
    const c = U256.fromU64(50);
    assert(a.lte(b), "100 <= 100 should be true");
    assert(c.lte(a), "50 <= 100 should be true");
}

export function testU256ComparisonGreaterThanOrEqual(): void {
    const a = U256.fromU64(100);
    const b = U256.fromU64(100);
    const c = U256.fromU64(150);
    assert(a.gte(b), "100 >= 100 should be true");
    assert(c.gte(a), "150 >= 100 should be true");
}

export function testU256ToBytes(): void {
    const value = U256.fromU64(0x1234567890abcdef);
    const bytes = value.toBytes();
    assertEqual(bytes.length, 32, "toBytes should return 32 bytes");
    // Check the last 8 bytes contain our value in big-endian
    assertEqual(bytes[24], 0x12, "Byte 24 should be 0x12");
    assertEqual(bytes[25], 0x34, "Byte 25 should be 0x34");
    assertEqual(bytes[31], 0xef, "Byte 31 should be 0xef");
}

export function testU256FromBytes(): void {
    const bytes = new Uint8Array(32);
    bytes[31] = 0x64; // 100 in last byte
    const value = U256.fromBytes(bytes);
    assertEqual(value.low0, 100, "fromBytes should correctly parse value");
}

export function testU256RoundTrip(): void {
    const original = U256.fromU64(0x123456789abcdef0);
    const bytes = original.toBytes();
    const restored = U256.fromBytes(bytes);
    assert(original.eq(restored), "Round-trip should preserve value");
}

// =============================================================================
// Hash Tests
// =============================================================================

export function testHashZero(): void {
    const zero = Hash.zero();
    assert(zero.isZero(), "Hash.zero() should be zero");
}

export function testHashFromBytes(): void {
    const bytes = new Uint8Array(32);
    bytes[0] = 0x42;
    bytes[31] = 0xAB;
    const hash = Hash.fromBytes(bytes);
    assert(!hash.isZero(), "Hash from non-zero bytes should not be zero");
    assertEqual(hash.toBytes()[0], 0x42, "First byte should be 0x42");
    assertEqual(hash.toBytes()[31], 0xAB, "Last byte should be 0xAB");
}

export function testHashEquality(): void {
    const bytes1 = new Uint8Array(32);
    const bytes2 = new Uint8Array(32);
    bytes1[0] = 0x42;
    bytes2[0] = 0x42;
    const hash1 = Hash.fromBytes(bytes1);
    const hash2 = Hash.fromBytes(bytes2);
    assert(hash1.eq(hash2), "Hashes from same bytes should be equal");
}

export function testHashInequality(): void {
    const bytes1 = new Uint8Array(32);
    const bytes2 = new Uint8Array(32);
    bytes1[0] = 0x42;
    bytes2[0] = 0x43;
    const hash1 = Hash.fromBytes(bytes1);
    const hash2 = Hash.fromBytes(bytes2);
    assert(!hash1.eq(hash2), "Hashes from different bytes should not be equal");
}

// =============================================================================
// Address Tests
// =============================================================================

export function testAddressEmpty(): void {
    const addr = new Address();
    assert(addr.isEmpty(), "New address should be empty");
}

export function testAddressFromString(): void {
    const addr = Address.fromString("acc://alice.acme/tokens");
    assert(!addr.isEmpty(), "Address from string should not be empty");
    assertEqual(addr.toString(), "acc://alice.acme/tokens", "toString should match original");
}

export function testAddressEquality(): void {
    const addr1 = Address.fromString("acc://alice.acme");
    const addr2 = Address.fromString("acc://alice.acme");
    assert(addr1.eq(addr2), "Same addresses should be equal");
}

export function testAddressInequality(): void {
    const addr1 = Address.fromString("acc://alice.acme");
    const addr2 = Address.fromString("acc://bob.acme");
    assert(!addr1.eq(addr2), "Different addresses should not be equal");
}

// =============================================================================
// Topic Tests
// =============================================================================

export function testTopicFromBytes(): void {
    const bytes = new Uint8Array(32);
    bytes[0] = 0xAB;
    const topic = Topic.fromBytes(bytes);
    assertEqual(topic.toBytes()[0], 0xAB, "Topic should preserve bytes");
}

export function testTopicFromHash(): void {
    const bytes = new Uint8Array(32);
    bytes[15] = 0x12;
    const hash = Hash.fromBytes(bytes);
    const topic = Topic.fromHash(hash);
    assertEqual(topic.toBytes()[15], 0x12, "Topic from hash should preserve bytes");
}

export function testTopicEmpty(): void {
    const topic = Topic.empty();
    assert(topic.isEmpty(), "Empty topic should be empty");
}

// =============================================================================
// ErrorCode Tests
// =============================================================================

export function testErrorCodes(): void {
    assertEqual(ErrorCode.SUCCESS, 0, "SUCCESS should be 0");
    assertEqual(ErrorCode.INVALID_ARGUMENT, 1, "INVALID_ARGUMENT should be 1");
    assertEqual(ErrorCode.OVERFLOW, 2, "OVERFLOW should be 2");
    assertEqual(ErrorCode.UNAUTHORIZED, 8, "UNAUTHORIZED should be 8");
    assertEqual(ErrorCode.UNKNOWN_FUNCTION, 255, "UNKNOWN_FUNCTION should be 255");
}

// =============================================================================
// Test Runner
// =============================================================================

export function runAllTests(): string {
    passCount = 0;
    failCount = 0;

    // U256 tests
    testU256Zero();
    testU256One();
    testU256FromU64();
    testU256FromU64Max();
    testU256Addition();
    testU256AdditionWithCarry();
    testU256Subtraction();
    testU256SubtractionWithBorrow();
    testU256Multiplication();
    testU256MultiplicationByZero();
    testU256MultiplicationByOne();
    testU256Division();
    testU256DivisionByOne();
    testU256DivisionSmallerByLarger();
    testU256ComparisonEqual();
    testU256ComparisonLessThan();
    testU256ComparisonGreaterThan();
    testU256ComparisonLessThanOrEqual();
    testU256ComparisonGreaterThanOrEqual();
    testU256ToBytes();
    testU256FromBytes();
    testU256RoundTrip();

    // Hash tests
    testHashZero();
    testHashFromBytes();
    testHashEquality();
    testHashInequality();

    // Address tests
    testAddressEmpty();
    testAddressFromString();
    testAddressEquality();
    testAddressInequality();

    // Topic tests
    testTopicFromBytes();
    testTopicFromHash();
    testTopicEmpty();

    // ErrorCode tests
    testErrorCodes();

    return `Tests completed: ${passCount} passed, ${failCount} failed`;
}

// Export test summary
export function getTestSummary(): string {
    return `Passed: ${passCount}, Failed: ${failCount}`;
}

// Export test details
export function getTestResults(): string {
    let result = "";
    for (let i = 0; i < testResults.length; i++) {
        result += testResults[i] + "\n";
    }
    return result;
}
