import { once } from 'node:events'
import { createConnection } from 'node:net'

import { SocketConnectionFailedError } from './errors'

export const beginSocketConnection = async (config: {
  path: string
  timeout: number
}) => {
  const socket = createConnection(config.path)

  try {
    await once(socket, 'connect', {
      signal: AbortSignal.timeout(config.timeout),
    })

    return socket
  } catch (error: unknown) {
    socket.destroy()

    const wrapped = new SocketConnectionFailedError(
      'サーバとの接続に失敗しました',
      { cause: error },
    )

    throw wrapped
  }
}
