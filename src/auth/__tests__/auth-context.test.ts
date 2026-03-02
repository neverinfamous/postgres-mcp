/**
 * Tests for auth-context (AsyncLocalStorage threading)
 */

import { describe, it, expect } from "vitest";
import { runWithAuthContext, getAuthContext } from "../../auth/auth-context.js";
import type { AuthenticatedContext } from "../../auth/middleware.js";

describe("Auth Context (AsyncLocalStorage)", () => {
  const mockAuthContext: AuthenticatedContext = {
    authenticated: true,
    scopes: ["read", "write"],
  };

  it("should return undefined outside of auth context", () => {
    expect(getAuthContext()).toBeUndefined();
  });

  it("should return the context inside runWithAuthContext", () => {
    const result = runWithAuthContext(mockAuthContext, () => {
      const ctx = getAuthContext();
      expect(ctx).toBe(mockAuthContext);
      expect(ctx?.authenticated).toBe(true);
      expect(ctx?.scopes).toEqual(["read", "write"]);
      return "done";
    });
    expect(result).toBe("done");
  });

  it("should return undefined after runWithAuthContext completes", () => {
    runWithAuthContext(mockAuthContext, () => {
      // Inside context
    });
    // Outside context
    expect(getAuthContext()).toBeUndefined();
  });

  it("should support async functions", async () => {
    const result = await runWithAuthContext(mockAuthContext, async () => {
      // Simulate async work
      await Promise.resolve();
      const ctx = getAuthContext();
      expect(ctx?.authenticated).toBe(true);
      return "async-done";
    });
    expect(result).toBe("async-done");
  });

  it("should isolate concurrent contexts", async () => {
    const ctx1: AuthenticatedContext = {
      authenticated: true,
      scopes: ["read"],
    };
    const ctx2: AuthenticatedContext = {
      authenticated: true,
      scopes: ["admin"],
    };

    const [result1, result2] = await Promise.all([
      runWithAuthContext(ctx1, async () => {
        await Promise.resolve();
        return getAuthContext()?.scopes;
      }),
      runWithAuthContext(ctx2, async () => {
        await Promise.resolve();
        return getAuthContext()?.scopes;
      }),
    ]);

    expect(result1).toEqual(["read"]);
    expect(result2).toEqual(["admin"]);
  });
});
