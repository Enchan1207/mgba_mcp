import { Result } from '@praha/byethrow'
import type { BufferedReader } from 'src/lib/socket-client/reader'

import {
  CommandFailedError,
  TooLargeResponseError,
  UnexpectedResponseFormatError,
} from './errors'

export const createResponseReader =
  (reader: BufferedReader) =>
  async (): Result.ResultAsync<
    Buffer,
    CommandFailedError | TooLargeResponseError
  > => {
    const header = await reader.readExact(5)

    const result = header.toString('ascii', 0, 1)
    if (!['S', 'E'].includes(result)) {
      throw new UnexpectedResponseFormatError('応答の成否を判断できません')
    }

    const size = header.readUInt32LE(1)
    if (size > 1e6) {
      return Result.fail(
        new TooLargeResponseError('レスポンスが大きすぎます', { size }),
      )
    }

    const body = await reader.readExact(size)

    const terminator = await reader.readExact(1)
    if (terminator.toString('ascii', 0, 1) !== '\n') {
      throw new UnexpectedResponseFormatError('末端が改行で終わっていません')
    }

    const response =
      result === 'S'
        ? Result.succeed(body)
        : Result.fail(
            new CommandFailedError('コマンドの実行に失敗しました', {
              response: body.toString('ascii'),
            }),
          )

    return response
  }
