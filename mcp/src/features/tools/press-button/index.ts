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

const tool = new McpTool<{ Bindings: Bindings }>().register('press_button', {
  title: 'ボタンを押す',
  description: 'ゲームボーイのボタンを押し、同じフレーム数だけ離す',
  input: z.object({
    button: z
      .enum(['A', 'B', 'SELECT', 'START', 'RIGHT', 'LEFT', 'UP', 'DOWN'])
      .transform((button) => button.toLowerCase() as Button),
    frames: z.number().int().min(1).max(18000).default(10),
  }),
  output: z.object({
    framesAdvanced: z.number().int(),
    totalFrames: z.number().int(),
  }),
  handler: (c) => {
    const client = c.get('mgba-client')
    const runInExecutor = c.get('run-in-executor')
    const { button, frames } = c.input

    return runInExecutor(async () => {
      try {
        await Result.unwrap(client.send({ verb: 'release', args: ['all'] }))
        await Result.unwrap(
          client.send({ verb: 'type', args: [button, frames] }),
        )
        const status = await Result.unwrap(client.send({ verb: 'status' }))
        return { framesAdvanced: frames * 2, totalFrames: status.frames }
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
