/**
 * postgres-mcp - Resource Annotations Tests
 *
 * Tests for the resource annotation presets and helper functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    HIGH_PRIORITY,
    MEDIUM_PRIORITY,
    LOW_PRIORITY,
    ASSISTANT_FOCUSED,
    withPriority,
    withTimestamp,
} from "../resourceAnnotations.js";

describe("Resource Annotation Presets", () => {
    it("HIGH_PRIORITY should have correct values", () => {
        expect(HIGH_PRIORITY.audience).toEqual(["user", "assistant"]);
        expect(HIGH_PRIORITY.priority).toBe(0.9);
    });

    it("MEDIUM_PRIORITY should have correct values", () => {
        expect(MEDIUM_PRIORITY.audience).toEqual(["user", "assistant"]);
        expect(MEDIUM_PRIORITY.priority).toBe(0.6);
    });

    it("LOW_PRIORITY should have correct values", () => {
        expect(LOW_PRIORITY.audience).toEqual(["user", "assistant"]);
        expect(LOW_PRIORITY.priority).toBe(0.4);
    });

    it("ASSISTANT_FOCUSED should have correct values", () => {
        expect(ASSISTANT_FOCUSED.audience).toEqual(["assistant"]);
        expect(ASSISTANT_FOCUSED.priority).toBe(0.5);
    });
});

describe("withPriority", () => {
    it("should create annotations with custom priority and default base", () => {
        const result = withPriority(0.7);
        expect(result.priority).toBe(0.7);
        expect(result.audience).toEqual(["user", "assistant"]);
    });

    it("should create annotations with custom priority and custom base", () => {
        const result = withPriority(0.3, ASSISTANT_FOCUSED);
        expect(result.priority).toBe(0.3);
        expect(result.audience).toEqual(["assistant"]);
    });

    it("should not mutate the base object", () => {
        const original = { ...HIGH_PRIORITY };
        withPriority(0.1, HIGH_PRIORITY);
        expect(HIGH_PRIORITY).toEqual(original);
    });
});

describe("withTimestamp", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should add lastModified timestamp with default base", () => {
        const result = withTimestamp();
        expect(result.lastModified).toBe("2025-06-15T12:00:00.000Z");
        expect(result.audience).toEqual(["user", "assistant"]);
        expect(result.priority).toBe(0.6);
    });

    it("should add lastModified timestamp with custom base", () => {
        const result = withTimestamp(LOW_PRIORITY);
        expect(result.lastModified).toBe("2025-06-15T12:00:00.000Z");
        expect(result.priority).toBe(0.4);
    });

    it("should not mutate the base object", () => {
        const original = { ...MEDIUM_PRIORITY };
        withTimestamp(MEDIUM_PRIORITY);
        expect(MEDIUM_PRIORITY).toEqual(original);
    });
});
