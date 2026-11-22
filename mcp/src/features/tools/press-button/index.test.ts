import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { MgbaServerCommand } from 'src/external/mgba-client/command'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { McpTool } from 'src/lib/mcp-tools'
import { beforeAll, describe, expect, test } from 'vitest'
import type { z } from 'zod'

import tool from '.'

describe('press_buttonで画像を返す場合', () => {
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
  let inputSchema: z.ZodObject | undefined
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    let callback: ((input: object) => Promise<CallToolResult>) | undefined
    const server = {
      registerTool: (
        _name: string,
        config: { inputSchema: z.ZodObject },
        handler: (input: object) => Promise<CallToolResult>,
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
    actual = await callback?.(
      inputSchema?.parse({
        button: 'A',
        frames: 3,
        includeScreen: true,
      }) as object,
    )
  })

  test('操作後に画面を取得する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'type', args: ['a', 3] },
      { verb: 'capture' },
    ])
  })

  test('画像の取得時点の累積フレーム数を返す', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 6,
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

  test('画像返却の指定に真偽値以外を受け付けない', () => {
    expect(
      inputSchema?.safeParse({ button: 'A', includeScreen: 'true' }).success,
    ).toBe(false)
  })
})

describe('press_buttonで画像返却を省略した場合', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return Result.succeed(
        command.verb === 'status' ? { frames: 99 } : undefined,
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
    actual = await callback?.({ button: 'a', frames: 3, includeScreen: false })
  })

  test('画面を取得しない', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'type', args: ['a', 3] },
      { verb: 'status' },
    ])
  })

  test('フレーム数だけ返す', () => {
    expect(actual?.content).toStrictEqual([
      { type: 'text', text: '{"framesAdvanced":6,"totalFrames":99}' },
    ])
  })
})
