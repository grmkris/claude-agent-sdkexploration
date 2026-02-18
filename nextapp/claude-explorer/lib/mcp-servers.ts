export const MCP_SERVERS = {
  weather: {
    type: "stdio" as const,
    command: "bun",
    args: ["tools/weather-server.ts"],
  },
  "railway-mcp-server": {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "@railway/mcp-server"],
    env: {},
  },
  Linear: {
    type: "stdio" as const,
    command: "npx",
    args: ["-y", "mcp-remote", "https://mcp.linear.app/sse"],
    env: {},
  },
}
