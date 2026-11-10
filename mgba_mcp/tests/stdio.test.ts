import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const entrypoint = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("stdio server", () => {
  it("responds to an MCP initialize request", async () => {
    const child = spawn(process.execPath, [entrypoint], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    try {
      const response = new Promise<unknown>((resolve, reject) => {
        let output = "";
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          output += chunk;
          const newline = output.indexOf("\n");
          if (newline !== -1) {
            try {
              resolve(JSON.parse(output.slice(0, newline)) as unknown);
            } catch (error) {
              reject(error);
            }
          }
        });
        child.on("error", reject);
        child.on("exit", (code) => reject(new Error(`Server exited with code ${code}`)));
      });

      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-11-25",
            capabilities: {},
            clientInfo: { name: "mgba-mcp-test", version: "1.0.0" },
          },
        })}\n`,
      );

      await expect(response).resolves.toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: { serverInfo: { name: "mgba-mcp", version: "0.1.0" } },
      });
    } finally {
      child.kill();
    }
  }, 10000);
});
