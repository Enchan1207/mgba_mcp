import { Result } from '@praha/byethrow'
import type { Button } from 'src/external/mgba-client/command'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { z } from 'zod'

import { encodePng } from '../../../lib/image-encoder'
import { McpTool } from '../../../lib/mcp-tools'

type Bindings = {
  'run-with-mgba-client': RunWithMgbaClient
}

const FrameCountSchema = z.number().int().min(1).max(18000)
const ButtonSchema = z
  .enum(['A', 'B', 'SELECT', 'START', 'RIGHT', 'LEFT', 'UP', 'DOWN'])
  .transform((button) => button.toLowerCase() as Button)
const PressButtonStepSchema = z.object({
  type: z.literal('press_button'),
  button: ButtonSchema,
  frames: FrameCountSchema,
})
const WaitStepSchema = z.object({
  type: z.literal('wait'),
  frames: FrameCountSchema,
})
const StepSchema = z.discriminatedUnion('type', [
  PressButtonStepSchema,
  WaitStepSchema,
])

const ToolInputSchema = z.object({
  steps: z.array(StepSchema).min(1),
  includeScreen: z.boolean().default(false),
})

const ToolOutputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

const tool = new McpTool<{ Bindings: Bindings }>().register('run_input_batch', {
  title: '入力と待機を順に実行する',
  description:
    '指定したボタン入力と待機を順番に実行する。ボタン入力は指定フレーム数だけ押してから同じフレーム数だけ離す。指定時は操作後の画面も返す',
  input: ToolInputSchema,
  outputSchema: ToolOutputSchema,
  handler: (c) => {
    const runWithMgbaClient = c.get('run-with-mgba-client')
    const { steps, includeScreen } = c.input

    return runWithMgbaClient(async (client) => {
      let framesAdvanced = 0
      try {
        for (const step of steps) {
          // oxlint-disable-next-line no-await-in-loop -- ステップを指定順に実行する
          await Result.unwrap(client.send({ verb: 'release', args: ['all'] }))
          if (step.type === 'press_button') {
            // oxlint-disable-next-line no-await-in-loop -- 前の操作の完了を待つ
            await Result.unwrap(
              client.send({ verb: 'type', args: [step.button, step.frames] }),
            )
            framesAdvanced += step.frames * 2
          } else {
            // oxlint-disable-next-line no-await-in-loop -- 前の操作の完了を待つ
            await Result.unwrap(
              client.send({ verb: 'step', args: [step.frames] }),
            )
            framesAdvanced += step.frames
          }
        }

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
