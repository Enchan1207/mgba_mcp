import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { createEmulatorCommand, parseTotalFrames } from './control.js'

const buttonSchema = z.enum([
  'A',
  'B',
  'SELECT',
  'START',
  'RIGHT',
  'LEFT',
  'UP',
  'DOWN',
])
const framesSchema = z.number().int().min(1).max(18000).default(10)

function socketPathFromEnvironment(): string {
  const path = process.env['MGBA_MCP_SOCKET_PATH']
  if (!path)
    throw new Error('MGBA_MCP_SOCKET_PATH must be set to a non-empty path')
  return path
}

export function createServer(): McpServer {
  const command = createEmulatorCommand(socketPathFromEnvironment())
  const server = new McpServer({ name: 'mgba-mcp', version: '0.1.0' })
  let previousOperation: Promise<void> = Promise.resolve()

  server.registerTool(
    'press_button',
    {
      description:
        'Press a Game Boy button, then release all buttons for the same number of frames.',
      inputSchema: z.object({ button: buttonSchema, frames: framesSchema }),
      outputSchema: z.object({
        framesAdvanced: z.number().int(),
        totalFrames: z.number().int(),
      }),
    },
    ({ button, frames }) => {
      const operation = previousOperation.then(async () => {
        let began = false
        try {
          began = true
          await command('RELEASE ALL')
          await command(`TYPE ${button} ${frames}`)
          const totalFrames = parseTotalFrames(await command('STATUS'))
          const result = { framesAdvanced: frames * 2, totalFrames }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            structuredContent: result,
          }
        } catch (error) {
          let suffix = ''
          if (began) {
            try {
              await command('RELEASE ALL')
            } catch {
              suffix = '; button release could not be confirmed'
            }
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: `${String(error)}; frames advanced may be unknown${suffix}`,
              },
            ],
            isError: true,
          }
        }
      })
      previousOperation = operation.then(() => undefined)
      return operation
    },
  )

  return server
}
