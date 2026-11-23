import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import tools from 'src/tools'

import type { RunWithMgbaClient } from './external/mgba-client/run-with-client'
import { createMgbaClientRunner } from './external/mgba-client/run-with-client'
import { McpTool } from './lib/mcp-tools'
import { createExecutor } from './lib/run-in-executor'

const socketPath = process.env.MGBA_MCP_SOCKET_PATH
if (!socketPath) {
  throw new Error('MGBA_MCP_SOCKET_PATHが設定されていません')
}

const connectAndRun = createMgbaClientRunner({
  path: socketPath,
  timeout: 10000,
})
const runInExecutor = createExecutor()
const runWithMgbaClient: RunWithMgbaClient = (task) =>
  runInExecutor(() => connectAndRun(task))

// ツールにコンテキストをバインド
const tool = new McpTool()
  .route(tools)
  .bind('run-with-mgba-client', runWithMgbaClient)

serveStdio(
  () => {
    const server = new McpServer({
      name: 'mgba-mcp',
      version: '0.1.0',
    })

    return tool.mount(server)
  },
  {
    onerror: (error) => {
      console.error('mgba-mcp stdio error:', error)
      process.exitCode = 1
    },
  },
)
