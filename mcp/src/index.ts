import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { Result } from '@praha/byethrow'
import tools from 'src/features/tools'

import { createMgbaClient } from './external/mgba-client'
import { McpTool } from './lib/mcp-tools'
import { createExecutor } from './lib/run-in-executor'
import { beginSocketConnection } from './lib/socket-client/connect'

// mGBAサーバにコネクションを張り、CONTROL接続を開始
const socket = await beginSocketConnection({
  path: process.env.MGBA_MCP_SOCKET_PATH,
  timeout: 10000,
})
const mgbaClient = createMgbaClient(socket)
await Result.unwrap(mgbaClient.send({ verb: 'connect', args: ['control'] }))

const executor = createExecutor()

// ツールにコンテキストをバインド
const tool = new McpTool()
  .route(tools)
  .bind('mgba-client', mgbaClient)
  .bind('run-in-executor', executor)

process.stdin.once('end', () => {
  socket.destroy()
})

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

      socket.destroy()
    },
  },
)
