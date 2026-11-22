import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Result } from '@praha/byethrow'
import { describe, expect, test } from 'vitest'

import { createMgbaClientRunner } from './run-with-client'

// oxlint-disable vitest/no-conditional-in-test -- 疑似サーバが受信コマンドに応じた応答を返す
describe('CONTROL接続のライフタイム', () => {
  test('ツールごとに接続し、正常終了と失敗の後に解放する', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mgba-mcp-'))
    const socketPath = path.join(directory, 'server.sock')
    const connections: { commands: string[]; closed: Promise<void> }[] = []
    let activeControls = 0
    let maxActiveControls = 0
    const server = createServer((socket) => {
      const commands: string[] = []
      const closed = new Promise<void>((resolve) => {
        socket.once('close', () => {
          resolve()
        })
      })
      connections.push({ commands, closed })

      let pending = ''
      socket.on('data', (chunk: Buffer) => {
        pending += chunk.toString('ascii')
        while (pending.includes('\n')) {
          const newline = pending.indexOf('\n')
          const command = pending.slice(0, newline)
          pending = pending.slice(newline + 1)
          commands.push(command)

          if (command === 'HELLO CONTROL') {
            activeControls += 1
            maxActiveControls = Math.max(maxActiveControls, activeControls)
          }
          const body =
            command === 'STATUS'
              ? 'frames=42 pressed_keys=0 has_frame=true'
              : ''
          const header = Buffer.alloc(5)
          header.write('S')
          header.writeUInt32LE(Buffer.byteLength(body), 1)
          socket.write(
            Buffer.concat([header, Buffer.from(body), Buffer.from('\n')]),
          )
          if (command === 'QUIT') {
            socket.end()
          }
        }
      })
      socket.once('close', () => {
        activeControls -= 1
      })
    })

    try {
      server.listen(socketPath)
      await once(server, 'listening')
      const runWithClient = createMgbaClientRunner({
        path: socketPath,
        timeout: 1000,
      })

      const first = await runWithClient(async (client) => {
        await Result.unwrap(client.send({ verb: 'status' }))
        return Result.unwrap(client.send({ verb: 'status' }))
      })
      await connections[0]?.closed

      const failure = await runWithClient(async (client) => {
        await Result.unwrap(client.send({ verb: 'status' }))
        throw new Error('操作に失敗しました')
      }).then(
        () => null,
        (error: unknown) => error,
      )
      await connections[1]?.closed

      await runWithClient((client) =>
        Result.unwrap(client.send({ verb: 'status' })),
      )
      await connections[2]?.closed

      expect({
        first: first.frames,
        failure: String(failure),
        commands: connections.map(({ commands }) => commands),
        maxActiveControls,
        activeControls,
      }).toStrictEqual({
        first: 42,
        failure: 'Error: 操作に失敗しました',
        commands: [
          ['HELLO CONTROL', 'STATUS', 'STATUS', 'QUIT'],
          ['HELLO CONTROL', 'STATUS'],
          ['HELLO CONTROL', 'STATUS', 'QUIT'],
        ],
        maxActiveControls: 1,
        activeControls: 0,
      })
    } finally {
      server.close()
      await once(server, 'close')
      await rm(directory, { recursive: true, force: true })
    }
  })
})
