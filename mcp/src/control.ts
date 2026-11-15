import { createConnection, type Socket } from 'node:net'
import { SocketReader } from 'src/lib/socket-reader'

const MAX_BODY_LENGTH = 1024 * 1024
const MAX_SAFE_FRAMES = BigInt(Number.MAX_SAFE_INTEGER)

export type EmulatorConnection = {
  socket: Socket
  reader: SocketReader
  pending: Promise<void>
}

function parseResponseHeader(header: Buffer): {
  success: boolean
  length: number
} {
  const length = header.readUInt32LE(1)
  if ((header[0] !== 0x53 && header[0] !== 0x45) || length > MAX_BODY_LENGTH) {
    throw new Error('Invalid server response header')
  }
  return { success: header[0] === 0x53, length }
}

function serverCommandError(
  command: string,
  code: string,
): Error & { serverCode: string } {
  return Object.assign(new Error(`${command} failed: ${code}`), {
    serverCode: code,
  })
}

export function isServerCommandError(
  error: unknown,
): error is Error & { serverCode: string } {
  return error instanceof Error && 'serverCode' in error
}

async function exchange(
  socket: Socket,
  reader: SocketReader,
  command: string,
): Promise<Buffer> {
  await new Promise<void>((resolve, reject) => {
    socket.write(`${command}\n`, (error?: Error | null) => {
      if (error) reject(error)
      else resolve()
    })
  })
  const { success, length } = parseResponseHeader(await reader.readExactly(5))
  const body = await reader.readExactly(length)
  if ((await reader.readExactly(1))[0] !== 0x0a) {
    throw new Error('Invalid server response terminator')
  }
  if (!success) throw serverCommandError(command, body.toString('ascii'))
  return body
}

export function request(
  connection: EmulatorConnection,
  command: string,
): Promise<Buffer> {
  const result = connection.pending.then(() =>
    exchange(connection.socket, connection.reader, command),
  )
  connection.pending = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export async function connectEmulator(
  path: string,
): Promise<EmulatorConnection> {
  const socket = createConnection({ path })
  try {
    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        socket.off('error', onError)
        resolve()
      }
      const onError = (error: Error) => {
        socket.off('connect', onConnect)
        reject(error)
      }
      socket.once('connect', onConnect)
      socket.once('error', onError)
    })
    socket.on('error', () => socket.destroy())
    const connection = {
      socket,
      reader: new SocketReader(socket[Symbol.asyncIterator]()),
      pending: Promise.resolve(),
    }
    await request(connection, 'HELLO CONTROL')
    return connection
  } catch (error) {
    socket.destroy()
    throw error
  }
}

export function closeEmulator(connection: EmulatorConnection): void {
  connection.socket.destroy()
}

export function createEmulatorCommand(
  path: string,
): (command: string) => Promise<Buffer> {
  let connection: EmulatorConnection | undefined
  return async (command) => {
    if (!connection || connection.socket.destroyed)
      connection = await connectEmulator(path)
    try {
      return await request(connection, command)
    } catch (error) {
      if (!isServerCommandError(error)) {
        closeEmulator(connection)
        connection = undefined
      }
      throw error
    }
  }
}

export function parseTotalFrames(body: Buffer): number {
  const match = /^frames=(\d+) pressed_keys=(\d+) has_frame=(true|false)$/.exec(
    body.toString('ascii'),
  )
  if (!match) throw new Error('Invalid STATUS response')
  if (BigInt(match[2]!) !== 0n)
    throw new Error('STATUS reports pressed buttons')
  const total = BigInt(match[1]!)
  if (total > MAX_SAFE_FRAMES)
    throw new Error('STATUS frames exceeds safe integer range')
  return Number(total)
}
