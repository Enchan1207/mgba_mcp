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

describe('run_input_batch', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return Result.succeed(
        command.verb === 'status' ? { frames: 100 } : undefined,
      )
    },
  } as unknown as MgbaClient
  let inputSchema: z.ZodObject | undefined
  let actual: CallToolResult | undefined
  let runnerCalls = 0

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
      .bind('run-with-mgba-client', ((task) => {
        runnerCalls += 1
        return Promise.resolve().then(() => task(client))
      }) satisfies RunWithMgbaClient)
      .mount(server)
    actual = await callback?.(
      inputSchema?.parse({
        steps: [
          { type: 'press_button', button: 'A', frames: 3 },
          { type: 'wait', frames: 5 },
          { type: 'press_button', button: 'B', frames: 2 },
        ],
      }) as object,
    )
  })

  test('各ステップを指定順に実行する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'type', args: ['a', 3] },
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [5] },
      { verb: 'release', args: ['all'] },
      { verb: 'type', args: ['b', 2] },
      { verb: 'status' },
    ])
  })

  test('バッチ全体を1回のCONTROL接続で実行する', () => {
    expect(runnerCalls).toBe(1)
  })

  test('入力と待機で進んだフレーム数を合計する', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 15,
      totalFrames: 100,
    })
  })

  const invalidSteps: unknown[][] = [
    [],
    [{ type: 'wait', frames: 0 }],
    [{ type: 'press_button', button: 'A', frames: 18001 }],
    [{ type: 'press_button', button: 'A' }],
    [{ type: 'press_button', button: 'X', frames: 1 }],
    [{ type: 'unknown', frames: 1 }],
  ]

  test.each(invalidSteps.map((steps) => ({ steps })))(
    '不正なステップ$stepsを拒否する',
    ({ steps }) => {
      expect(inputSchema?.safeParse({ steps }).success).toBe(false)
    },
  )
})

describe('run_input_batchで画像を返す場合', () => {
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
    let inputSchema: z.ZodObject | undefined
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
        steps: [{ type: 'wait', frames: 3 }],
        includeScreen: true,
      }) as object,
    )
  })

  test('全ステップ実行後に画面を取得する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [3] },
      { verb: 'capture' },
    ])
  })

  test('画像と同じ時点の累積フレーム数を返す', () => {
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

describe('run_input_batchの途中で失敗した場合', () => {
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
    let callback: ((input: object) => Promise<CallToolResult>) | undefined
    let inputSchema: z.ZodObject | undefined
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
        steps: [
          { type: 'press_button', button: 'A', frames: 2 },
          { type: 'wait', frames: 3 },
          { type: 'press_button', button: 'B', frames: 4 },
        ],
      }) as object,
    )
  })

  test('残りのステップを実行せず全ボタンを解放する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'type', args: ['a', 2] },
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [3] },
      { verb: 'release', args: ['all'] },
    ])
  })

  test('失敗をMCPエラーとして返す', () => {
    expect(actual?.isError).toBe(true)
  })
})
