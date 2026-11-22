import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import { encodePng } from 'src/lib/image-encoder'

export const createOperationResult = async (
  client: MgbaClient,
  framesAdvanced: number,
  includeScreen: boolean,
) => {
  if (includeScreen) {
    const capture = await Result.unwrap(client.send({ verb: 'capture' }))
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
  }

  const status = await Result.unwrap(client.send({ verb: 'status' }))
  const result = { framesAdvanced, totalFrames: status.frames }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result,
  }
}
