import { createConnection, type Socket } from 'node:net'
import { SocketReader } from './lib/socket-reader/index'

const MAX_BODY_LENGTH = 1024 * 1024
const MAX_SAFE_FRAMES = BigInt(Number.MAX_SAFE_INTEGER)
const DEFAULT_CONNECT_TIMEOUT_MS = 5000
const DEFAULT_RESPONSE_TIMEOUT_MS = 30000

type Timeouts = { connectTimeoutMs: number; responseTimeoutMs: number }

type EmulatorConnection = { socket: Socket; reader: SocketReader }

const parseResponseHeader = (header: Buffer) => {
  const length = header.readUInt32LE(1)
  if ((header[0] !== 0x53 && header[0] !== 0x45) || length > MAX_BODY_LENGTH)
    throw new Error('Invalid server response header')
  return { success: header[0] === 0x53, length }
}

const serverCommandError = (command: string, code: string) =>
  Object.assign(new Error(`${command} failed: ${code}`), { serverCode: code })

export const isServerCommandError = (
  error: unknown,
): error is Error & { serverCode: string } =>
  error instanceof Error && 'serverCode' in error

const exchange = async (
  connection: EmulatorConnection,
  command: string,
  responseTimeoutMs: number,
): Promise<Buffer> => {
  const { socket, reader } = connection
  const timer = setTimeout(
    () => socket.destroy(new Error(`${command} response timed out`)),
    responseTimeoutMs,
  )
  try {
    await new Promise<void>((resolve, reject) => {
      socket.write(`${command}\n`, (error?: Error | null) => {
        if (error) reject(error)
        else resolve()
      })
    })
    const { success, length } = parseResponseHeader(await reader.readExactly(5))
    const body = await reader.readExactly(length)
    if ((await reader.readExactly(1))[0] !== 0x0a)
      throw new Error('Invalid server response terminator')
    if (!success) throw serverCommandError(command, body.toString('ascii'))
    return body
  } finally {
    clearTimeout(timer)
  }
}

const connectEmulator = async (
  path: string,
  timeouts: Timeouts,
  signal: AbortSignal,
): Promise<EmulatorConnection> => {
  const socket = createConnection({ path })
  socket.on('error', () => undefined)
  const onAbort = () =>
    socket.destroy(new Error('CONTROL connection is closed'))
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy(new Error('CONTROL connection timed out'))
      }, timeouts.connectTimeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    const connection = {
      socket,
      reader: new SocketReader(socket[Symbol.asyncIterator]()),
    }
    await exchange(connection, 'HELLO CONTROL', timeouts.responseTimeoutMs)
    return connection
  } catch (error) {
    socket.destroy()
    throw error
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

export const createControlConnection = (
  path: string,
  timeouts: Timeouts = {
    connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
    responseTimeoutMs: DEFAULT_RESPONSE_TIMEOUT_MS,
  },
) => {
  let connection: EmulatorConnection | undefined
  let pendingConnection: Promise<EmulatorConnection> | undefined
  let active = false
  let failed = false
  let cleanupAllowed = false
  let closed = false
  let operationId = 0
  let previousCommand: Promise<void> = Promise.resolve()
  const abort = new AbortController()

  const discard = () => {
    connection?.socket.destroy()
    connection = undefined
  }

  const getConnection = async (): Promise<EmulatorConnection> => {
    if (connection && !connection.socket.destroyed) return connection
    pendingConnection ??= connectEmulator(path, timeouts, abort.signal)
    try {
      const connected = await pendingConnection
      if (closed) {
        connected.socket.destroy()
        throw new Error('CONTROL connection is closed')
      }
      connection = connected
      return connected
    } finally {
      pendingConnection = undefined
    }
  }

  return {
    beginOperation: () => {
      if (closed || active) throw new Error('CONTROL operation cannot start')
      active = true
      operationId += 1
      failed = false
      cleanupAllowed = false
    },
    endOperation: () => {
      active = false
      failed = false
      cleanupAllowed = false
    },
    command: (command: string): Promise<Buffer> => {
      if (closed || !active)
        return Promise.reject(new Error('CONTROL operation is unavailable'))
      const requestOperationId = operationId
      const result = previousCommand.then(async () => {
        if (closed || !active || requestOperationId !== operationId)
          throw new Error('CONTROL operation is unavailable')
        if (failed && (!cleanupAllowed || command !== 'RELEASE ALL'))
          throw new Error('CONTROL operation has already failed')
        let connected: EmulatorConnection
        try {
          connected = await getConnection()
        } catch (error) {
          failed = true
          cleanupAllowed = false
          discard()
          throw error
        }
        try {
          const body = await exchange(
            connected,
            command,
            timeouts.responseTimeoutMs,
          )
          if (failed) cleanupAllowed = false
          return body
        } catch (error) {
          if (isServerCommandError(error)) {
            failed = true
            cleanupAllowed = command !== 'RELEASE ALL'
          } else {
            failed = true
            cleanupAllowed = false
            discard()
          }
          throw error
        }
      })
      previousCommand = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
    close: () => {
      closed = true
      abort.abort()
      discard()
    },
  }
}

export const parseTotalFrames = (body: Buffer): number => {
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
