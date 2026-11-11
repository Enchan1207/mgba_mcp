import { McpServer } from "@modelcontextprotocol/server";

export function createServer(): McpServer {
  return new McpServer({ name: "mgba-mcp", version: "0.1.0" });
}
