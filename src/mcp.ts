/**
 * approvepath MCP server. Tools: map_approvals.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The computation is pure and local: no upstream API, no
 * authentication, no configuration, and no repository is
 * touched — the tool only maps supplied data.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, mapApprovals, VERSION } from "./approvepath.js";

const TOOLS = [
  {
    name: "map_approvals",
    description:
      "Map the approval path for a pull request: apply CODEOWNERS rules to each changed file (last matching rule wins) and report who actually reviews those files, from supplied review history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        codeowners: {
          type: "array",
          description: "CODEOWNERS rules in file order: {pattern, owners}",
          items: {
            type: "object",
            properties: {
              pattern: {
                type: "string",
                description: "Path pattern to match changed files against",
              },
              owners: {
                type: "array",
                description: "Owners assigned when this rule wins",
                items: { type: "string" },
              },
            },
            required: ["pattern", "owners"],
          },
        },
        changed_files: {
          type: "array",
          description: "Paths of the files the PR changes",
          items: { type: "string" },
        },
        reviews: {
          type: "array",
          description: "Past review activity (optional): {reviewer, files}",
          items: {
            type: "object",
            properties: {
              reviewer: {
                type: "string",
                description: "Reviewer name",
              },
              files: {
                type: "array",
                description: "Files this review entry covered",
                items: { type: "string" },
              },
            },
            required: ["reviewer", "files"],
          },
        },
      },
      required: ["codeowners", "changed_files"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "approvepath", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "map_approvals") {
      out = mapApprovals(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
