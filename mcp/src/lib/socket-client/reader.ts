import { SocketDisconnectedError } from './errors'

export type BufferedReader = {
  readExact: (length: number) => Promise<Buffer>
}

export const withBufferedReader = (
  source: AsyncIterator<Buffer>,
): BufferedReader => {
  let buffer = Buffer.alloc(0)

  const readExact = async (length: number) => {
    while (buffer.length < length) {
      // oxlint-disable-next-line no-await-in-loop
      const next = await source.next()

      if (next.done === true) {
        throw new SocketDisconnectedError('接続が切断されました')
      }

      buffer = Buffer.concat([buffer, next.value])
    }

    const result = buffer.subarray(0, length)
    buffer = buffer.subarray(length)

    return result
  }

  return { readExact }
}
