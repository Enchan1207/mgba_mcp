import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import { CommandFailedError } from 'src/external/mgba-client/response/errors'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { z } from 'zod'

import { createReadScreenText } from '../../features/game-state/read-screen-text'
import { encodePng } from '../../lib/image-encoder'
import { McpTool } from '../../lib/mcp-tools'

type Bindings = {
  'run-with-mgba-client': RunWithMgbaClient
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
  description: '現在の画面をPNG画像で返し、対応ROMでは文字情報を付加する',
  input: z.object({}),
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const runWithMgbaClient = c.get('run-with-mgba-client')

    return runWithMgbaClient(async (client) => {
      const { capture, framesAdvanced } = await captureScreen(client)
      const png = await encodePng(capture)
      const screenText = await createReadScreenText(async (address, length) => {
        const response = await Result.unwrap(
          client.send({ verb: 'read', args: [address, length] }),
        )
        return response.memorySnapshot
      })()
      const result = { framesAdvanced, totalFrames: capture.frames }

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result) },
          ...(screenText === undefined
            ? []
            : [
                {
                  type: 'text' as const,
                  text:
                    'Screen text (tile coordinates, y is 0-based):\n' +
                    screenText.lines
                      .map(({ y, text }) => `y=${y}: ${JSON.stringify(text)}`)
                      .join('\n'),
                },
              ]),
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
