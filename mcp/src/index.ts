import { McpServer } from '@modelcontextprotocol/server'

import { createPressButtonTool } from './features/tools/press-button/index'
import type { ToolConnection } from './lib/tool/index'

export const createMcpServer = (connection: ToolConnection): McpServer => {
  const server = new McpServer({ name: 'mgba-mcp', version: '0.1.0' })
  for (const tool of [createPressButtonTool(connection.command)]) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
      },
      (input) => connection.runOperation(() => tool.execute(input)),
    )
  }

  return server
}
