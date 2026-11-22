import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { Executor } from 'src/lib/run-in-executor'
import { z } from 'zod'

import type { Button } from '../../../external/mgba-client/command'
import { McpTool } from '../../../lib/mcp-tools'

type Bindings = {
  'mgba-client': MgbaClient
  'run-in-executor': Executor
}

const ToolInputSchema = z.object({
  button: z
    .enum(['A', 'B', 'SELECT', 'START', 'RIGHT', 'LEFT', 'UP', 'DOWN'])
    .transform((button) => button.toLowerCase() as Button),
  frames: z.number().int().min(1).max(18000).default(10),
})

const ToolOutputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

const tool = new McpTool<{ Bindings: Bindings }>().register('press_button', {
  title: 'ボタンを押す',
  description: 'ゲームボーイのボタンを押し、同じフレーム数だけ離す',
  input: ToolInputSchema,
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const client = c.get('mgba-client')
    const runInExecutor = c.get('run-in-executor')
    const { button, frames } = c.input

    return runInExecutor(async () => {
      try {
        const result = await Result.pipe(
          client.send({ verb: 'release', args: ['all'] }),
          Result.andThen(() =>
            client.send({ verb: 'type', args: [button, frames] }),
          ),
          Result.andThen(() => client.send({ verb: 'status' })),
          Result.map((status) => ({
            framesAdvanced: frames * 2,
            totalFrames: status.frames,
          })),
          Result.unwrap(),
        )

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          structuredContent: result,
        }
      } catch (error) {
        try {
          await Result.unwrap(client.send({ verb: 'release', args: ['all'] }))
        } catch {
          // 解放に失敗しても元のエラーを返す
        }
        throw error
      }
    })
  },
})

export default tool
