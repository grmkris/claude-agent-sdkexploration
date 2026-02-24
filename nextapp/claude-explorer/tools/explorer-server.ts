import type { RouterClient } from "@orpc/server";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

import type { router } from "../lib/procedures";

import { router as routerDef } from "../lib/procedures";
import { registerAllTools } from "./mcp/orpc-to-mcp";

const baseUrl =
  process.env.EXPLORER_BASE_URL ??
  `http://localhost:${process.env.PORT ?? 3000}`;
const link = new RPCLink({
  url: process.env.EXPLORER_RPC_URL ?? `${baseUrl}/rpc`,
});
const client: RouterClient<typeof router> = createORPCClient(link);

const server = new McpServer({
  name: "claude-explorer",
  version: "2.0.0",
});

registerAllTools(server, routerDef, client, baseUrl);

const transport = new StdioServerTransport();
await server.connect(transport);
