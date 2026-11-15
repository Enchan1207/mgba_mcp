#!/usr/bin/env node

import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { createControlConnection } from './control.js'
import { createMcpServer } from './index.js'
import { createOperationQueue } from './lib/operation-queue/index.js'

const socketPath = process.env['MGBA_MCP_SOCKET_PATH']
if (!socketPath)
  throw new Error('MGBA_MCP_SOCKET_PATH must be set to a non-empty path')

const control = createControlConnection(socketPath)
const queue = createOperationQueue()
const close = () => {
  queue.close()
  control.close()
}

process.stdin.once('end', close)

serveStdio(
  () =>
    createMcpServer({
      command: control.command,
      runOperation: (operation) =>
        queue.run(async () => {
          control.beginOperation()
          try {
            return await operation()
          } finally {
            control.endOperation()
          }
        }),
    }),
  {
    onerror: (error) => {
      console.error('mgba-mcp stdio error:', error)
      process.exitCode = 1
      close()
    },
  },
)
