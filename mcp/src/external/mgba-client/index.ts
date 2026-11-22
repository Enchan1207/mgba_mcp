import type { Socket } from 'node:net'

import { Result } from '@praha/byethrow'

import { withBufferedReader } from '../../lib/socket-client/reader'
import type { MgbaServerCommand } from './command'
import { parseCommand } from './command'
import type { InvalidArgumentError } from './command/errors'
import type {
  CommandFailedError,
  TooLargeResponseError,
} from './response/errors'
import type { MgbaResponseTypeFor } from './response/parse'
import { createSucceededResponseParser as parseSucceededResponse } from './response/parse'
import { createResponseReader } from './response/reader'

export type MgbaClient = {
  send: <Command extends MgbaServerCommand>(
    command: Command,
  ) => Result.ResultAsync<
    MgbaResponseTypeFor<Command['verb']>,
    CommandFailedError | TooLargeResponseError | InvalidArgumentError
  >
}

const write = (socket: Socket) => (data: string | Uint8Array) =>
  new Promise<void>((resolve, reject) => {
    socket.write(data, (error) => {
      if (error === null || error === undefined) {
        resolve()
      } else {
        reject(error)
      }
    })
  })

export const createMgbaClient = (socket: Socket) => {
  const reader = withBufferedReader(socket.iterator())
  const readResponse = createResponseReader(reader)

  const send = <Command extends MgbaServerCommand>(command: Command) =>
    Result.pipe(
      Result.succeed(command),
      Result.andThen(parseCommand),
      Result.andThen(Result.fn({ try: write(socket), safe: true })),
      Result.andThen(readResponse),
      Result.map(
        (responseRaw): MgbaResponseTypeFor<Command['verb']> =>
          parseSucceededResponse<Command['verb']>({
            verb: command.verb,
            responseRaw,
          }),
      ),
    )

  return {
    send,
  } satisfies MgbaClient
}
