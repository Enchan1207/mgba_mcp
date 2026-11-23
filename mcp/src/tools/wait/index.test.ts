import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { MgbaServerCommand } from 'src/external/mgba-client/command'
import { CommandFailedError } from 'src/external/mgba-client/response/errors'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { McpTool } from 'src/lib/mcp-tools'
import { beforeAll, describe, expect, test } from 'vitest'
import type { z } from 'zod'

import tool from '.'

describe('wait', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return Result.succeed(
        command.verb === 'status' ? { frames: 55 } : undefined,
      )
    },
  } as unknown as MgbaClient
  let callback:
    | ((input: { frames: number }) => Promise<CallToolResult>)
    | undefined
  let inputSchema: z.ZodObject | undefined
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    const server = {
      registerTool: (
        _name: string,
        config: { inputSchema: z.ZodObject },
        handler: (input: { frames: number }) => Promise<CallToolResult>,
      ) => {
        inputSchema = config.inputSchema
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('run-with-mgba-client', ((task) =>
        Promise.resolve().then(() => task(client))) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.({ frames: 10 })
  })

  test('全ボタンを解放してから進める', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [10] },
      { verb: 'status' },
    ])
  })

  test('進んだフレーム数と累積フレーム数を返す', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 10,
      totalFrames: 55,
    })
  })

  test.each([0, 18001, 1.5])('範囲外のフレーム数%sを拒否する', (frames) => {
    expect(inputSchema?.safeParse({ frames }).success).toBe(false)
  })
})

describe('waitの失敗時', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return command.verb === 'step'
        ? Result.fail(
            new CommandFailedError('コマンドに失敗しました', {
              response: 'INTERNAL_ERROR',
            }),
          )
        : Result.succeed(undefined)
    },
  } as unknown as MgbaClient
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    let callback:
      | ((input: { frames: number }) => Promise<CallToolResult>)
      | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: (input: { frames: number }) => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('run-with-mgba-client', ((task) =>
        Promise.resolve().then(() => task(client))) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.({ frames: 5 })
  })

  test('実行失敗後に全ボタンを解放する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [5] },
      { verb: 'release', args: ['all'] },
    ])
  })

  test('失敗をMCPエラーとして返す', () => {
    expect(actual?.isError).toBe(true)
  })
})

describe('waitで画像を返す場合', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return Result.succeed(
        command.verb === 'capture'
          ? {
              frames: 42,
              width: 160,
              height: 144,
              pixels: Buffer.alloc(160 * 144 * 4),
            }
          : undefined,
      )
    },
  } as unknown as MgbaClient
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    let callback: ((input: object) => Promise<CallToolResult>) | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: (input: object) => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('run-with-mgba-client', ((task) =>
        Promise.resolve().then(() => task(client))) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.({ frames: 3, includeScreen: true })
  })

  test('操作後に画面を取得する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [3] },
      { verb: 'capture' },
    ])
  })

  test('画像の取得時点の累積フレーム数を返す', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 3,
      totalFrames: 42,
    })
  })

  test('PNG画像を返す', () => {
    const image = actual?.content.find((item) => item.type === 'image')
    const png = Buffer.from((image as { data: string }).data, 'base64')
    expect(png.subarray(0, 8)).toStrictEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  })
})
