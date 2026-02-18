/**
 * Standalone MCP server providing weather tools.
 * Communicates over stdio — designed to be spawned by Claude Code via .mcp.json.
 *
 * Tools:
 *   get_weather    — Get current weather for a city
 *   convert_temperature — Convert between Celsius and Fahrenheit
 *
 * Test standalone: echo '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | bun tools/weather-server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});

const WEATHER_DATA: Record<string, { temp: number; condition: string }> = {
  "san francisco": { temp: 18, condition: "foggy" },
  "new york": { temp: 25, condition: "sunny" },
  "london": { temp: 14, condition: "rainy" },
  "tokyo": { temp: 28, condition: "humid" },
  "tallinn": { temp: -5, condition: "snowy" },
};

server.registerTool(
  "get_weather",
  {
    description: "Get current weather for a city",
    inputSchema: {
      city: z.string().describe("City name"),
      unit: z.enum(["celsius", "fahrenheit"]).optional().describe("Temperature unit (default: celsius)"),
    },
  },
  async ({ city, unit }) => {
    const weather = WEATHER_DATA[city.toLowerCase()] ?? { temp: 20, condition: "clear" };
    const temp = unit === "fahrenheit" ? weather.temp * 9 / 5 + 32 : weather.temp;
    const unitLabel = unit === "fahrenheit" ? "F" : "C";

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          city,
          temperature: `${temp}°${unitLabel}`,
          condition: weather.condition,
        }),
      }],
    };
  }
);

server.registerTool(
  "convert_temperature",
  {
    description: "Convert temperature between Celsius and Fahrenheit",
    inputSchema: {
      value: z.number().describe("Temperature value"),
      from: z.enum(["celsius", "fahrenheit"]).describe("Source unit"),
    },
  },
  async ({ value, from }) => {
    const converted = from === "celsius"
      ? { value: value * 9 / 5 + 32, unit: "fahrenheit" }
      : { value: (value - 32) * 5 / 9, unit: "celsius" };

    return {
      content: [{
        type: "text" as const,
        text: `${value}° ${from} = ${converted.value.toFixed(1)}° ${converted.unit}`,
      }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
