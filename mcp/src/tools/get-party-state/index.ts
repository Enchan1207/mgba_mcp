import { Result } from '@praha/byethrow'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { z } from 'zod'

import { readPartyState } from '../../features/game-state/read-save-state'
import { McpTool } from '../../lib/mcp-tools'

type Bindings = {
  'run-with-mgba-client': RunWithMgbaClient
}

const tool = new McpTool<{ Bindings: Bindings }>().register('get_party_state', {
  title: '手持ちポケモンを取得する',
  description:
    '通常手持ち領域から種族、名前、HP、技、PPを取得する。戦闘中の状態は反映されない場合がある',
  input: z.object({}),
  handler: (c) =>
    c.get('run-with-mgba-client')(async (client) => {
      const result = await readPartyState(async (address, length) => {
        const response = await Result.unwrap(
          client.send({ verb: 'read', args: [address, length] }),
        )
        return response.memorySnapshot
      })
      const value =
        result === null
          ? { supported: false, reason: 'unsupported_rom' }
          : { supported: true, ...result }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(value) }],
        structuredContent: value,
      }
    }),
})

export default tool
