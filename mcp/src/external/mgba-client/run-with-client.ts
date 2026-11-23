import { Result } from '@praha/byethrow'

import { beginSocketConnection } from '../../lib/socket-client/connect'
import type { MgbaClient } from '.'
import { createMgbaClient } from '.'

export type RunWithMgbaClient = <T>(
  task: (client: MgbaClient) => Promise<T>,
) => Promise<T>

export const createMgbaClientRunner =
  (config: { path: string; timeout: number }): RunWithMgbaClient =>
  async (task) => {
    const socket = await beginSocketConnection(config)
    try {
      const client = createMgbaClient(socket)
      await Result.unwrap(client.send({ verb: 'connect', args: ['control'] }))
      const result = await task(client)
      await Result.unwrap(client.send({ verb: 'quit' }))
      return result
    } finally {
      socket.destroy()
    }
  }
