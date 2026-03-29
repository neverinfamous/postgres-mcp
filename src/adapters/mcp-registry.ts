import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { logger } from "../utils/logger.js";
import type {
  ToolDefinition,
  ResourceDefinition,
  PromptDefinition,
} from "../types/index.js";
import { getAuthContext } from "../auth/auth-context.js";
import { getRequiredScope } from "../auth/scope-map.js";
import { requireScope } from "../auth/middleware.js";
import type { DatabaseAdapter } from "./database-adapter.js";

export function registerAdapterTools(
  adapter: DatabaseAdapter,
  server: McpServer,
  enabledTools: Set<string>,
): void {
  const tools = adapter.getToolDefinitions();
  let registered = 0;

  for (const tool of tools) {
    if (enabledTools.has(tool.name)) {
      registerSingleTool(adapter, server, tool);
      registered++;
    }
  }

  logger.info(
    `Registered ${String(registered)}/${String(tools.length)} tools from ${adapter.name}`,
    { module: "SERVER" },
  );
}

export function registerSingleTool(
  adapter: DatabaseAdapter,
  server: McpServer,
  tool: ToolDefinition,
): void {
  const toolOptions: Record<string, unknown> = {
    description: tool.description,
  };

  if (tool.annotations?.title) {
    toolOptions["title"] = tool.annotations.title;
  }

  if (tool.inputSchema !== undefined) {
    toolOptions["inputSchema"] = tool.inputSchema;
  }

  if (tool.outputSchema !== undefined) {
    toolOptions["outputSchema"] = tool.outputSchema;
  }

  if (tool.annotations) {
    toolOptions["annotations"] = tool.annotations;
  }

  if (tool.icons && tool.icons.length > 0) {
    toolOptions["icons"] = tool.icons;
  }

  const hasOutputSchema = Boolean(tool.outputSchema);

  server.registerTool(
    tool.name,
    toolOptions as {
      description?: string;
      inputSchema?: z.ZodType;
      outputSchema?: z.ZodType;
    },
    async (args: unknown, extra: unknown) => {
      try {
        const authCtx = getAuthContext();
        if (authCtx?.authenticated) {
          const requiredScope = getRequiredScope(tool.name);
          requireScope(authCtx, requiredScope);
        }

        const extraMeta = extra as {
          _meta?: { progressToken?: string | number };
        };
        const progressToken = extraMeta?._meta?.progressToken;

        const context = adapter.createContext(undefined, server, progressToken);
        const auditInterceptor = adapter.getAuditInterceptor();
        const result = auditInterceptor
          ? await auditInterceptor.around(
              tool.name,
              args,
              context.requestId,
              () => tool.handler(args, context),
            )
          : await tool.handler(args, context);

        if (hasOutputSchema) {
          const enriched = JSON.stringify({
            ...(result as object),
            _meta: { tokenEstimate: 0 },
          });
          const tokenEstimate = Math.ceil(
            Buffer.byteLength(enriched, "utf8") / 4,
          );
          const finalText = enriched.replace(
            '"tokenEstimate":0',
            `"tokenEstimate":${String(tokenEstimate)}`,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: finalText,
              },
            ],
            structuredContent: result as Record<string, unknown>,
          };
        }

        if (typeof result === "object" && result !== null) {
          const withMeta = JSON.stringify(
            { ...result, _meta: { tokenEstimate: 0 } },
            null,
            2,
          );
          const tokenEstimate = Math.ceil(
            Buffer.byteLength(withMeta, "utf8") / 4,
          );
          const finalText = withMeta.replace(
            '"tokenEstimate": 0',
            `"tokenEstimate": ${String(tokenEstimate)}`,
          );
          return {
            content: [{ type: "text" as const, text: finalText }],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (hasOutputSchema) {
          const errorResult = {
            success: false,
            error: errorMessage,
            code: "INTERNAL_ERROR",
            category: "internal",
            recoverable: false,
          };
          
          const enriched = JSON.stringify({
            ...errorResult,
            _meta: { tokenEstimate: 0 },
          });
          const tokenEstimate = Math.ceil(
            Buffer.byteLength(enriched, "utf8") / 4,
          );
          const finalText = enriched.replace(
            '"tokenEstimate":0',
            `"tokenEstimate":${String(tokenEstimate)}`,
          );

          return {
            content: [
              {
                type: "text" as const,
                text: finalText,
              },
            ],
            structuredContent: errorResult,
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}

export function registerAdapterResources(
  adapter: DatabaseAdapter,
  server: McpServer,
): void {
  const resources = adapter.getResourceDefinitions();
  for (const resource of resources) {
    registerSingleResource(adapter, server, resource);
  }
  logger.info(
    `Registered ${String(resources.length)} resources from ${adapter.name}`,
    { module: "SERVER" },
  );
}

export function registerSingleResource(
  adapter: DatabaseAdapter,
  server: McpServer,
  resource: ResourceDefinition,
): void {
  server.registerResource(
    resource.name,
    resource.uri,
    {
      description: resource.description,
      mimeType: resource.mimeType ?? "application/json",
      ...(resource.annotations && { annotations: resource.annotations }),
    },
    async (uri: URL) => {
      const context = adapter.createContext();
      const result = await resource.handler(uri.toString(), context);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: resource.mimeType ?? "application/json",
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
            ...(resource.annotations && {
              annotations: resource.annotations,
            }),
          },
        ],
      };
    },
  );
}

export function registerAdapterPrompts(
  adapter: DatabaseAdapter,
  server: McpServer,
): void {
  const prompts = adapter.getPromptDefinitions();
  for (const prompt of prompts) {
    registerSinglePrompt(adapter, server, prompt);
  }
  logger.info(
    `Registered ${String(prompts.length)} prompts from ${adapter.name}`,
    { module: "SERVER" },
  );
}

export function registerSinglePrompt(
  adapter: DatabaseAdapter,
  server: McpServer,
  prompt: PromptDefinition,
): void {
  server.registerPrompt(
    prompt.name,
    { description: prompt.description },
    async (providedArgs) => {
      const context = adapter.createContext();
      const args = (providedArgs ?? {}) as Record<string, string>;
      const result = await prompt.handler(args, context);
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          },
        ],
      };
    },
  );
}
