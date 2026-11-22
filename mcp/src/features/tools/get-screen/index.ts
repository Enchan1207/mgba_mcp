import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import { CommandFailedError } from 'src/external/mgba-client/response/errors'
import type { Executor } from 'src/lib/run-in-executor'
import { z } from 'zod'

import { encodePng } from '../../../lib/image-encoder'
import { McpTool } from '../../../lib/mcp-tools'

type Bindings = {
  'mgba-client': MgbaClient
  'run-in-executor': Executor
}

const ToolOutputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

const captureScreen = async (client: MgbaClient) => {
  try {
    const result = await Result.pipe(
      client.send({ verb: 'capture' }),
      Result.map((capture) => ({ capture, framesAdvanced: 0 })),
      Result.unwrap(),
    )
    return result
  } catch (error) {
    if (
      !(error instanceof CommandFailedError) ||
      error.response !== 'NO_FRAME'
    ) {
      throw error
    }

    try {
      const result = await Result.pipe(
        client.send({ verb: 'release', args: ['all'] }),
        Result.andThen(() => client.send({ verb: 'step', args: [1] })),
        Result.andThen(() => client.send({ verb: 'capture' })),
        Result.map((capture) => ({ capture, framesAdvanced: 1 })),
        Result.unwrap(),
      )
      return result
    } catch (retryError) {
      try {
        await Result.unwrap(client.send({ verb: 'release', args: ['all'] }))
      } catch {
        // 解放に失敗しても元のエラーを返す
      }
      throw retryError
    }
  }
}

const tool = new McpTool<{ Bindings: Bindings }>().register('get_screen', {
  title: '画面を取得する',
  description: '現在の画面をPNG画像で返す',
  input: z.object({}),
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const client = c.get('mgba-client')
    const runInExecutor = c.get('run-in-executor')

    return runInExecutor(async () => {
      const { capture, framesAdvanced } = await captureScreen(client)
      const totalFrames = Number(capture.frames)
      if (!Number.isSafeInteger(totalFrames)) {
        throw new RangeError('画像の累積フレーム数が安全な整数の範囲外です')
      }
      const png = await encodePng(capture)
      const result = { framesAdvanced, totalFrames }

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
    })
  },
})

export default tool
