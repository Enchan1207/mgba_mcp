import {
  spawn,
  spawnSync,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const entrypoint = fileURLToPath(new URL('../dist/handler.js', import.meta.url))

describe('stdio server', () => {
  let child: ChildProcessWithoutNullStreams | undefined
  let actual: unknown

  beforeAll(async () => {
    child = spawn(process.execPath, [entrypoint], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        MGBA_MCP_SOCKET_PATH: '/tmp/mgba-mcp-stdio-test.sock',
      },
    })

    const response = new Promise<unknown>((resolve, reject) => {
      let output = ''
      child!.stdout.setEncoding('utf8')
      child!.stdout.on('data', (chunk: string) => {
        output += chunk
        const newline = output.indexOf('\n')
        if (newline !== -1) {
          try {
            resolve(JSON.parse(output.slice(0, newline)) as unknown)
          } catch (error) {
            reject(error)
          }
        }
      })
      child!.on('error', reject)
      child!.on('exit', (code) =>
        reject(new Error(`Server exited with code ${code}`)),
      )
    })

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'mgba-mcp-test', version: '1.0.0' },
        },
      })}\n`,
    )
    actual = await response
  }, 10000)

  afterAll(() => {
    child?.kill()
  })

  test('MCP initialize 要求にサーバ情報を返す', () => {
    expect(actual).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { serverInfo: { name: 'mgba-mcp', version: '0.1.0' } },
    })
  })
})

describe('起動設定', () => {
  test('ソケットパスが未設定なら起動に失敗する', () => {
    const env = { ...process.env }
    delete env['MGBA_MCP_SOCKET_PATH']
    const result = spawnSync(process.execPath, [entrypoint], { env })
    expect(result.status).toBe(1)
  })
})

describe('並行するstdio要求', () => {
  let directory: string | undefined
  let socketServer: Server | undefined
  let child: ChildProcessWithoutNullStreams | undefined
  const sockets = new Set<Socket>()
  const commands: string[] = []
  let listBeforeOperation = false
  let firstResult: unknown
  let secondResult: unknown
  let exitedAfterStdinClose = false
  let queuedOperationStarted = false

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'mgba-stdio-'))
    const socketPath = join(directory, 'control.sock')
    let releaseType: (() => void) | undefined
    let markTypeSeen: (() => void) | undefined
    const typeSeen = new Promise<void>((resolve) => {
      markTypeSeen = resolve
    })
    let markHangingTypeSeen: (() => void) | undefined
    const hangingTypeSeen = new Promise<void>((resolve) => {
      markHangingTypeSeen = resolve
    })
    socketServer = createServer((socket) => {
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
          if (command === 'TYPE SELECT 10') {
            markHangingTypeSeen?.()
            continue
          }
          const body = Buffer.from(
            command === 'STATUS'
              ? 'frames=20 pressed_keys=0 has_frame=true'
              : '',
          )
          const header = Buffer.alloc(5)
          header[0] = 0x53
          header.writeUInt32LE(body.length, 1)
          const response = Buffer.concat([header, body, Buffer.from('\n')])
          if (command === 'TYPE A 10' && !releaseType) {
            releaseType = () => socket.write(response)
            markTypeSeen?.()
          } else {
            socket.write(response)
          }
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      socketServer!.once('error', reject)
      socketServer!.listen(socketPath, () => resolve())
    })

    child = spawn(process.execPath, [entrypoint], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MGBA_MCP_SOCKET_PATH: socketPath },
    })
    const pending = new Map<number, (response: unknown) => void>()
    let output = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      for (;;) {
        const newline = output.indexOf('\n')
        if (newline < 0) break
        const message = JSON.parse(output.slice(0, newline)) as { id?: number }
        output = output.slice(newline + 1)
        if (message.id !== undefined) pending.get(message.id)?.(message)
      }
    })
    const request = (id: number, method: string, params: unknown) => {
      const response = new Promise<unknown>((resolve) =>
        pending.set(id, resolve),
      )
      child!.stdin.write(
        `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
      )
      return response
    }
    await request(1, 'initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    })
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    )

    const first = request(2, 'tools/call', {
      name: 'press_button',
      arguments: { button: 'A' },
    })
    await typeSeen
    const second = request(4, 'tools/call', {
      name: 'press_button',
      arguments: { button: 'B' },
    })
    await request(3, 'tools/list', {})
    listBeforeOperation = true
    releaseType?.()
    firstResult = await first
    secondResult = await second
    void request(5, 'tools/call', {
      name: 'press_button',
      arguments: { button: 'SELECT' },
    })
    await hangingTypeSeen
    void request(6, 'tools/call', {
      name: 'press_button',
      arguments: { button: 'START' },
    })
    await new Promise((resolve) => setImmediate(resolve))
    child.stdin.end()
    await new Promise<void>((resolve) => child!.once('exit', () => resolve()))
    exitedAfterStdinClose = true
    queuedOperationStarted = commands.includes('TYPE START 10')
  }, 10000)

  afterAll(async () => {
    child?.kill()
    for (const socket of sockets) socket.destroy()
    if (socketServer?.listening)
      await new Promise<void>((resolve) => socketServer!.close(() => resolve()))
    if (directory) await rm(directory, { recursive: true, force: true })
  })

  test('tools/listはゲーム操作の完了を待たない', () => {
    expect(listBeforeOperation).toBe(true)
  })

  test('各要求へ結果を返す', () => {
    expect([firstResult, secondResult]).toMatchObject([
      { id: 2, result: { structuredContent: { framesAdvanced: 20 } } },
      { id: 4, result: { structuredContent: { framesAdvanced: 20 } } },
    ])
  })

  test('操作中に別の操作のコマンドを送らない', () => {
    expect(commands.slice(0, 7)).toEqual([
      'HELLO CONTROL',
      'RELEASE ALL',
      'TYPE A 10',
      'STATUS',
      'RELEASE ALL',
      'TYPE B 10',
      'STATUS',
    ])
  })

  test('標準入力の切断後に終了する', () => {
    expect(exitedAfterStdinClose).toBe(true)
  })

  test('標準入力の切断後にCONTROLソケットを閉じる', () => {
    expect(sockets.size).toBe(0)
  })

  test('標準入力の切断後に待機中の操作を開始しない', () => {
    expect(queuedOperationStarted).toBe(false)
  })
})
