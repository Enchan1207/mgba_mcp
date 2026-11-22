import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { MgbaServerCommand } from 'src/external/mgba-client/command'
import type { RunWithMgbaClient } from 'src/external/mgba-client/run-with-client'
import { McpTool } from 'src/lib/mcp-tools'
import { beforeAll, describe, expect, test } from 'vitest'
import type { z } from 'zod'

import pressButton from './press-button'
import wait from './wait'
import walkFor from './walk-for'

describe.each([
  {
    name: 'press_button',
    tool: pressButton,
    input: { button: 'A', frames: 3, includeScreen: true },
    commands: [
      { verb: 'release', args: ['all'] },
      { verb: 'type', args: ['a', 3] },
      { verb: 'capture' },
    ],
    framesAdvanced: 6,
  },
  {
    name: 'walk_for',
    tool: walkFor,
    input: { direction: 'UP', frames: 3, includeScreen: true },
    commands: [
      { verb: 'release', args: ['all'] },
      { verb: 'press', args: ['up'] },
      { verb: 'step', args: [3] },
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [10] },
      { verb: 'capture' },
    ],
    framesAdvanced: 13,
  },
  {
    name: 'wait',
    tool: wait,
    input: { frames: 3, includeScreen: true },
    commands: [
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [3] },
      { verb: 'capture' },
    ],
    framesAdvanced: 3,
  },
])(
  '$nameで画像を返す場合',
  ({ tool, input, commands: expectedCommands, framesAdvanced }) => {
    const commands: MgbaServerCommand[] = []
    let imageCommands: MgbaServerCommand[] = []
    let noImageCommands: MgbaServerCommand[] = []
    const client = {
      send: (command: MgbaServerCommand) => {
        commands.push(command)
        if (command.verb === 'capture') {
          return Result.succeed({
            frames: 42n,
            width: 160,
            height: 144,
            pixels: Buffer.alloc(160 * 144 * 4),
          })
        }
        if (command.verb === 'status') {
          return Result.succeed({ frames: 999 })
        }
        return Result.succeed(undefined)
      },
    } as unknown as MgbaClient
    let inputSchema: z.ZodObject | undefined
    let actual: CallToolResult | undefined
    let noImageActual: CallToolResult | undefined

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
          Promise.resolve().then(() =>
            task(client),
          )) satisfies RunWithMgbaClient)
        .mount(server)
      actual = await callback?.(inputSchema?.parse(input) as object)
      imageCommands = [...commands]
      commands.length = 0
      noImageActual = await callback?.(
        inputSchema?.parse({ ...input, includeScreen: undefined }) as object,
      )
      noImageCommands = [...commands]
    })

    test('操作後に画面を取得する', () => {
      expect(imageCommands).toStrictEqual(expectedCommands)
    })

    test('画像の取得時点の累積フレーム数を返す', () => {
      expect(actual?.structuredContent).toStrictEqual({
        framesAdvanced,
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

    test('画像返却を省略した場合は画面を取得しない', () => {
      expect(noImageCommands).toStrictEqual([
        ...expectedCommands.slice(0, -1),
        { verb: 'status' },
      ])
    })

    test('画像返却を省略した場合はフレーム数だけ返す', () => {
      expect(noImageActual?.structuredContent).toStrictEqual({
        framesAdvanced,
        totalFrames: 999,
      })
    })

    test('画像返却を省略した場合は画像を返さない', () => {
      expect(noImageActual?.content).toStrictEqual([
        {
          type: 'text',
          text: JSON.stringify({ framesAdvanced, totalFrames: 999 }),
        },
      ])
    })

    test('画像返却の指定に真偽値以外を受け付けない', () => {
      expect(
        inputSchema?.safeParse({ ...input, includeScreen: 'true' }).success,
      ).toBe(false)
    })
  },
)
