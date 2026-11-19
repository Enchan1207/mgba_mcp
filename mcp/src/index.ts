import type { Socket } from 'node:net'

import { McpServer } from '@modelcontextprotocol/server'

import { createMgbaClient } from './external/mgba-client'
import { createExecutor } from './lib/run-in-executor'

export const createMcpServer = (socket: Socket): McpServer => {
  const server = new McpServer({
    name: 'mgba-mcp',
    version: '0.1.0',
  })

  const mgbaClient = createMgbaClient(socket)
  const runInExecutor = createExecutor()

  return server
}
