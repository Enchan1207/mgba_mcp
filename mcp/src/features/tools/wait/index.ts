import { Result } from '@praha/byethrow'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { z } from 'zod'

import { McpTool } from '../../../lib/mcp-tools'

type Bindings = {
  'run-with-mgba-client': RunWithMgbaClient
}

const ToolInputSchema = z.object({
  frames: z.number().int().min(1).max(18000),
})

const ToolOutputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

const tool = new McpTool<{ Bindings: Bindings }>().register('wait', {
  title: '入力せずに進める',
  description: '全ボタンを解放し、指定フレーム数だけ進める',
  input: ToolInputSchema,
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const runWithMgbaClient = c.get('run-with-mgba-client')
    const { frames } = c.input

    return runWithMgbaClient(async (client) => {
      try {
        const result = await Result.pipe(
          client.send({ verb: 'release', args: ['all'] }),
          Result.andThen(() => client.send({ verb: 'step', args: [frames] })),
          Result.andThen(() => client.send({ verb: 'status' })),
          Result.map((status) => ({
            framesAdvanced: frames,
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
