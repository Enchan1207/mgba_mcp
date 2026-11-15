import { createServer, type Server, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createControlConnection } from './control'

describe('CONTROL接続', () => {
  let directory: string | undefined
  let server: Server | undefined
  const sockets = new Set<Socket>()
  const commands: string[] = []
  let connectionCount = 0
  let capture: Buffer | undefined
  let serverError = false
  let blockedAfterError = false
  let malformedError = false
  let recovered = false
  let timedOut = false
  let recoveredAfterTimeout = false
  let disconnected = false
  let recoveredAfterDisconnect = false
  let closedWait = false

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mgba-control-'))
    const socketPath = join(directory, 'control.sock')
    server = createServer((socket) => {
      connectionCount += 1
      sockets.add(socket)
      socket.on('close', () => sockets.delete(socket))
      let input = ''
      socket.setEncoding('ascii')
      socket.on('data', (chunk: string) => {
        input += chunk
        for (;;) {
          const newline = input.indexOf('\n')
          if (newline < 0) break
          const command = input.slice(0, newline)
          input = input.slice(newline + 1)
          commands.push(command)
          if (command === 'HANG') continue
          if (command === 'DROP') {
            socket.destroy()
            continue
          }
          const body =
            command === 'CAPTURE'
              ? Buffer.from([1, 10, 2])
              : command === 'ERROR'
                ? Buffer.from('BAD_REQUEST')
                : Buffer.alloc(0)
          const header = Buffer.alloc(5)
          header[0] = command === 'ERROR' ? 0x45 : 0x53
          header.writeUInt32LE(body.length, 1)
          const response = Buffer.concat([
            header,
            body,
            Buffer.from(command === 'BAD' ? 'X' : '\n'),
          ])
          if (command === 'CAPTURE') {
            socket.write(response.subarray(0, 2))
            setImmediate(() => socket.write(response.subarray(2)))
          } else {
            socket.write(response)
          }
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject)
      server!.listen(socketPath, () => resolve())
    })

    const control = createControlConnection(socketPath, {
      connectTimeoutMs: 500,
      responseTimeoutMs: 50,
    })
    control.beginOperation()
    capture = await control.command('CAPTURE')
    try {
      await control.command('ERROR')
    } catch {
      serverError = true
    }
    await control.command('RELEASE ALL')
    try {
      await control.command('STATUS')
    } catch {
      blockedAfterError = true
    }
    control.endOperation()

    control.beginOperation()
    try {
      await control.command('BAD')
    } catch {
      malformedError = true
    }
    control.endOperation()

    control.beginOperation()
    await control.command('STATUS')
    recovered = true
    control.endOperation()

    control.beginOperation()
    try {
      await control.command('HANG')
    } catch {
      timedOut = true
    }
    control.endOperation()

    control.beginOperation()
    await control.command('STATUS')
    recoveredAfterTimeout = true
    control.endOperation()

    control.beginOperation()
    try {
      await control.command('DROP')
    } catch {
      disconnected = true
    }
    control.endOperation()

    control.beginOperation()
    await control.command('STATUS')
    recoveredAfterDisconnect = true
    control.endOperation()

    control.beginOperation()
    const waiting = control.command('HANG')
    await new Promise((resolve) => setImmediate(resolve))
    control.close()
    try {
      await waiting
    } catch {
      closedWait = true
    }
    control.endOperation()
  }, 10000)

  afterAll(async () => {
    for (const socket of sockets) socket.destroy()
    if (server?.listening)
      await new Promise<void>((resolve) => server!.close(() => resolve()))
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  test('分割受信した画像本文中の改行を終端と扱わない', () => {
    expect(capture).toEqual(Buffer.from([1, 10, 2]))
  })

  test('コマンドのエラー応答を通知する', () => {
    expect(serverError).toBe(true)
  })

  test('失敗した操作では解放後のコマンドを拒否する', () => {
    expect(blockedAfterError).toBe(true)
  })

  test('応答終端の異常を通知する', () => {
    expect(malformedError).toBe(true)
  })

  test('異常な接続を破棄して次の操作で再接続する', () => {
    expect(recovered).toBe(true)
  })

  test('応答待ちの上限で失敗する', () => {
    expect(timedOut).toBe(true)
  })

  test('時間切れの後は次の操作で再接続する', () => {
    expect(recoveredAfterTimeout).toBe(true)
  })

  test('接続断を通知する', () => {
    expect(disconnected).toBe(true)
  })

  test('接続断の後は次の操作で再接続する', () => {
    expect(recoveredAfterDisconnect).toBe(true)
  })

  test('終了時に進行中の応答待ちを解除する', () => {
    expect(closedWait).toBe(true)
  })

  test('要求と解放を順に送る', () => {
    expect(commands.slice(0, 4)).toEqual([
      'HELLO CONTROL',
      'CAPTURE',
      'ERROR',
      'RELEASE ALL',
    ])
  })

  test('破棄した接続を再利用しない', () => {
    expect(connectionCount).toBe(4)
  })
})
