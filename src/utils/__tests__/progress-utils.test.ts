/**
 * postgres-mcp - Progress Notification Utilities Tests
 *
 * Tests for progress notification context building,
 * progress sending, and batch progress reporting.
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildProgressContext,
  sendProgress,
} from "../progress-utils.js";
import type { ProgressContext } from "../progress-utils.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Create a minimal mock Server
function createMockServer() {
  return {
    server: {
      notification: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as McpServer;
}

describe("buildProgressContext", () => {
  it("should return undefined when ctx is undefined", () => {
    expect(buildProgressContext(undefined)).toBeUndefined();
  });

  it("should return undefined when server is undefined", () => {
    expect(
      buildProgressContext({ progressToken: "tok-1" } as never),
    ).toBeUndefined();
  });

  it("should return undefined when progressToken is undefined", () => {
    const server = createMockServer();
    expect(buildProgressContext({ server } as never)).toBeUndefined();
  });

  it("should return ProgressContext when both server and progressToken are present", () => {
    const server = createMockServer();
    const ctx = buildProgressContext({
      server,
      progressToken: "tok-1",
    } as never);
    expect(ctx).toBeDefined();
    expect(ctx!.server).toBe(server);
    expect(ctx!.progressToken).toBe("tok-1");
  });

  it("should accept numeric progressToken", () => {
    const server = createMockServer();
    const ctx = buildProgressContext({
      server,
      progressToken: 42,
    } as never);
    expect(ctx).toBeDefined();
    expect(ctx!.progressToken).toBe(42);
  });
});

describe("sendProgress", () => {
  it("should no-op when ctx is undefined", async () => {
    await expect(sendProgress(undefined, 1)).resolves.toBeUndefined();
  });

  it("should no-op when progressToken is undefined", async () => {
    const server = createMockServer();
    const ctx: ProgressContext = { server };
    await expect(sendProgress(ctx, 1)).resolves.toBeUndefined();
    expect(server.server.notification).not.toHaveBeenCalled();
  });

  it("should send notification with progress only", async () => {
    const server = createMockServer();
    const ctx: ProgressContext = { server, progressToken: "tok-1" };
    await sendProgress(ctx, 5);

    expect(server.server.notification).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "tok-1",
        progress: 5,
      },
    });
  });

  it("should include total when provided", async () => {
    const server = createMockServer();
    const ctx: ProgressContext = { server, progressToken: "tok-1" };
    await sendProgress(ctx, 3, 10);

    expect(server.server.notification).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "tok-1",
        progress: 3,
        total: 10,
      },
    });
  });

  it("should include message when provided", async () => {
    const server = createMockServer();
    const ctx: ProgressContext = { server, progressToken: "tok-1" };
    await sendProgress(ctx, 3, 10, "Processing item 3 of 10");

    expect(server.server.notification).toHaveBeenCalledWith({
      method: "notifications/progress",
      params: {
        progressToken: "tok-1",
        progress: 3,
        total: 10,
        message: "Processing item 3 of 10",
      },
    });
  });

  it("should omit message when it is empty string", async () => {
    const server = createMockServer();
    const ctx: ProgressContext = { server, progressToken: "tok-1" };
    await sendProgress(ctx, 1, undefined, "");

    const call = (server.server.notification as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { params: { message?: string } };
    expect(call.params.message).toBeUndefined();
  });

  it("should silently swallow notification errors", async () => {
    const server = createMockServer();
    (
      server.server.notification as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("transport closed"));

    const ctx: ProgressContext = { server, progressToken: "tok-1" };
    await expect(sendProgress(ctx, 1, 10)).resolves.toBeUndefined();
  });
});


