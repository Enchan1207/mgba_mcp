import { Result } from '@praha/byethrow'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { z } from 'zod'

import { readPlayerState } from '../../features/game-state/read-save-state'
import { McpTool } from '../../lib/mcp-tools'

type Bindings = {
  'run-with-mgba-client': RunWithMgbaClient
}

const tool = new McpTool<{ Bindings: Bindings }>().register('get_player_state', {
  title: 'プレイヤーの状態を取得する',
  description: '主人公名、マップID、座標、所持金、バッジを取得する',
  input: z.object({}),
  handler: (c) => c.get('run-with-mgba-client')(async (client) => {
    const result = await readPlayerState(async (address, length) => {
      const response = await Result.unwrap(client.send({ verb: 'read', args: [address, length] }))
      return response.memorySnapshot
    })
    const value = result === null ? { supported: false, reason: 'unsupported_rom' } : { supported: true, ...result }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(value) }],
      structuredContent: value,
    }
  }),
})

export default tool
