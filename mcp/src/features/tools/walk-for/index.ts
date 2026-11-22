import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { Button } from 'src/external/mgba-client/command'
import type { Executor } from 'src/lib/run-in-executor'
import { z } from 'zod'

import { McpTool } from '../../../lib/mcp-tools'

type Bindings = {
  'mgba-client': MgbaClient
  'run-in-executor': Executor
}

const ToolInputSchema = z.object({
  direction: z
    .enum(['UP', 'DOWN', 'LEFT', 'RIGHT'])
    .transform((direction) => direction.toLowerCase() as Button),
  frames: z.number().int().min(1).max(18000),
})

const ToolOutputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

const tool = new McpTool<{ Bindings: Bindings }>().register('walk_for', {
  title: '指定方向に進む',
  description: '方向キーを指定フレーム押し、解放後に10フレーム進める',
  input: ToolInputSchema,
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const client = c.get('mgba-client')
    const runInExecutor = c.get('run-in-executor')
    const releaseFrames = 10
    const { direction, frames } = c.input

    return runInExecutor(async () => {
      try {
        const result = await Result.pipe(
          client.send({ verb: 'release', args: ['all'] }),
          Result.andThen(() =>
            client.send({ verb: 'press', args: [direction] }),
          ),
          Result.andThen(() => client.send({ verb: 'step', args: [frames] })),
          Result.andThen(() => client.send({ verb: 'release', args: ['all'] })),
          Result.andThen(() =>
            client.send({ verb: 'step', args: [releaseFrames] }),
          ),
          Result.andThen(() => client.send({ verb: 'status' })),
          Result.map((status) => ({
            framesAdvanced: frames + releaseFrames,
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
