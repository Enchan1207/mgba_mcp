import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type {
  Button,
  MgbaServerCommand,
} from 'src/external/mgba-client/command'
import { CommandFailedError } from 'src/external/mgba-client/response/errors'
import { McpTool } from 'src/lib/mcp-tools'
import { createExecutor } from 'src/lib/run-in-executor'
import { beforeAll, describe, expect, test } from 'vitest'
import type { z } from 'zod'

import tool from '.'

describe('walk_forの正常系', () => {
  const commands: MgbaServerCommand[] = []
  const client = {
    send: (command: MgbaServerCommand) => {
      commands.push(command)
      return Result.succeed(
        command.verb === 'status' ? { frames: 123 } : undefined,
      )
    },
  } as unknown as MgbaClient
  let callback:
    | ((input: {
        direction: Button
        frames: number
      }) => Promise<CallToolResult>)
    | undefined
  let inputSchema: z.ZodObject | undefined
  let actual: CallToolResult | undefined

  beforeAll(async () => {
    const server = {
      registerTool: (
        _name: string,
        config: { inputSchema: z.ZodObject },
        handler: (input: {
          direction: Button
          frames: number
        }) => Promise<CallToolResult>,
      ) => {
        inputSchema = config.inputSchema
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('mgba-client', client)
      .bind('run-in-executor', createExecutor())
      .mount(server)
    const input = inputSchema?.parse({ direction: 'UP', frames: 12 }) as {
      direction: Button
      frames: number
    }
    actual = await callback?.(input)
  })

  test('押下と解放後のフレームを順に進める', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'press', args: ['up'] },
      { verb: 'step', args: [12] },
      { verb: 'release', args: ['all'] },
      { verb: 'step', args: [10] },
      { verb: 'status' },
    ])
  })

  test('進んだフレーム数と累積フレーム数を返す', () => {
    expect(actual?.structuredContent).toStrictEqual({
      framesAdvanced: 22,
      totalFrames: 123,
    })
  })

  test.each([0, 18001, 1.5])('範囲外のフレーム数%sを拒否する', (frames) => {
    expect(inputSchema?.safeParse({ direction: 'UP', frames }).success).toBe(
      false,
    )
  })

  test('方向キー以外を拒否する', () => {
    expect(inputSchema?.safeParse({ direction: 'A', frames: 1 }).success).toBe(
      false,
    )
  })
})

describe('walk_forの失敗時', () => {
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
      | ((input: {
          direction: Button
          frames: number
        }) => Promise<CallToolResult>)
      | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: (input: {
          direction: Button
          frames: number
        }) => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    new McpTool()
      .route(tool)
      .bind('mgba-client', client)
      .bind('run-in-executor', createExecutor())
      .mount(server)
    actual = await callback?.({ direction: 'up', frames: 5 })
  })

  test('実行失敗後に全ボタンを解放する', () => {
    expect(commands).toStrictEqual([
      { verb: 'release', args: ['all'] },
      { verb: 'press', args: ['up'] },
      { verb: 'step', args: [5] },
      { verb: 'release', args: ['all'] },
    ])
  })

  test('失敗をMCPエラーとして返す', () => {
    expect(actual?.isError).toBe(true)
  })
})
