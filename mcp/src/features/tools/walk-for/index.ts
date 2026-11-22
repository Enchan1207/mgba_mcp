import { Result } from '@praha/byethrow'
import type { Button } from 'src/external/mgba-client/command'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { z } from 'zod'

import { encodePng } from '../../../lib/image-encoder'
import { McpTool } from '../../../lib/mcp-tools'

type Bindings = {
  'run-with-mgba-client': RunWithMgbaClient
}

const ToolInputSchema = z.object({
  direction: z
    .enum(['UP', 'DOWN', 'LEFT', 'RIGHT'])
    .transform((direction) => direction.toLowerCase() as Button),
  frames: z.number().int().min(1).max(18000),
  includeScreen: z.boolean().default(false),
})

const ToolOutputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

const tool = new McpTool<{ Bindings: Bindings }>().register('walk_for', {
  title: '指定方向に進む',
  description:
    '方向キーを指定フレーム押し、解放後に10フレーム進める。指定時は操作後の画面も返す',
  input: ToolInputSchema,
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const runWithMgbaClient = c.get('run-with-mgba-client')
    const releaseFrames = 10
    const { direction, frames, includeScreen } = c.input

    return runWithMgbaClient(async (client) => {
      try {
        await Result.pipe(
          client.send({ verb: 'release', args: ['all'] }),
          Result.andThen(() =>
            client.send({ verb: 'press', args: [direction] }),
          ),
          Result.andThen(() => client.send({ verb: 'step', args: [frames] })),
          Result.andThen(() => client.send({ verb: 'release', args: ['all'] })),
          Result.andThen(() =>
            client.send({ verb: 'step', args: [releaseFrames] }),
          ),
          Result.unwrap(),
        )
        const framesAdvanced = frames + releaseFrames
        if (includeScreen) {
          const capture = await Result.unwrap(client.send({ verb: 'capture' }))
          const png = await encodePng(capture)
          const result = { framesAdvanced, totalFrames: capture.frames }
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(result) },
              {
                type: 'image' as const,
                data: png.toString('base64'),
                mimeType: 'image/png',
              },
            ],
            structuredContent: result,
          }
        }

        const status = await Result.unwrap(client.send({ verb: 'status' }))
        const result = { framesAdvanced, totalFrames: status.frames }
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
