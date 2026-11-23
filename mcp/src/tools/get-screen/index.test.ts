import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { MgbaServerCommand } from 'src/external/mgba-client/command'
import { CommandFailedError } from 'src/external/mgba-client/response/errors'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { McpTool } from 'src/lib/mcp-tools'
import { beforeAll, describe, expect, test } from 'vitest'

import tool from '.'

describe('get_screenで画面がある場合', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      if (command.verb === 'read') {
        return Result.succeed({ memorySnapshot: Buffer.alloc(command.args[1]) })
      }
      return Result.succeed({
        frames: 42,
        width: 160,
        height: 144,
        pixels: Buffer.alloc(160 * 144 * 4),
      })
    },
  } as unknown as MgbaClient
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    let callback: (() => Promise<CallToolResult>) | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: () => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('run-with-mgba-client', ((task) =>
        Promise.resolve().then(() => task(client))) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.()
  })

  test('現在の画面だけを取得する', () => {
    expect(commands).toStrictEqual([
      { verb: 'capture' },
      { verb: 'read', args: [0x134, 28] },
    ])
  })

  test('フレーム数を返す', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 0,
      totalFrames: 42,
    })
  })

  test('PNG画像を返す', () => {
    const image = actual?.content.find((item) => item.type === 'image')
    expect(image).toMatchObject({ type: 'image', mimeType: 'image/png' })
  })

  test('画像データがPNG形式である', () => {
    const image = actual?.content.find((item) => item.type === 'image')
    const png = Buffer.from((image as { data: string }).data, 'base64')
    expect(png.subarray(0, 8)).toStrictEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  })
})

describe('get_screenで画面がない場合', () => {
  const commands: MgbaServerCommand[] = []
  let captureCount = 0
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      if (command.verb === 'capture') {
        captureCount += 1
      }
      if (command.verb === 'capture' && captureCount === 1) {
        return Result.fail(
          new CommandFailedError('画面がありません', { response: 'NO_FRAME' }),
        )
      }
      if (command.verb === 'read') {
        return Result.succeed({ memorySnapshot: Buffer.alloc(command.args[1]) })
      }
      return Result.succeed({
        frames: 1,
        width: 160,
        height: 144,
        pixels: Buffer.alloc(160 * 144 * 4),
      })
    },
  } as unknown as MgbaClient
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    let callback: (() => Promise<CallToolResult>) | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: () => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('run-with-mgba-client', ((task) =>
        Promise.resolve().then(() => task(client))) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.()
  })

  test('ボタンを解放して1フレーム進めてから再取得する', () => {
    expect(commands).toStrictEqual([
      { verb: 'capture' },
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [1] },
      { verb: 'capture' },
      { verb: 'read', args: [0x134, 28] },
    ])
  })

  test('進めたフレーム数を返す', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 1,
      totalFrames: 1,
    })
  })
})

describe('get_screenで再取得に失敗した場合', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return command.verb === 'capture'
        ? Result.fail(
            new CommandFailedError('画面がありません', {
              response: 'NO_FRAME',
            }),
          )
        : Result.succeed(undefined)
    },
  } as unknown as MgbaClient
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    let callback: (() => Promise<CallToolResult>) | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: () => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('run-with-mgba-client', ((task) =>
        Promise.resolve().then(() => task(client))) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.()
  })

  test('再取得に失敗しても解放を試みる', () => {
    expect(commands).toStrictEqual([
      { verb: 'capture' },
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [1] },
      { verb: 'capture' },
      { verb: 'release', args: ['all'] },
    ])
  })

  test('失敗をMCPエラーとして返す', () => {
    expect(actual?.isError).toBe(true)
  })
})
