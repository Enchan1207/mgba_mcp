import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { Result } from '@praha/byethrow'
import type { MgbaClient } from 'src/external/mgba-client'
import type { MgbaServerCommand } from 'src/external/mgba-client/command'
import { CommandFailedError } from 'src/external/mgba-client/response/errors'
import { McpTool } from 'src/lib/mcp-tools'
import { createExecutor } from 'src/lib/run-in-executor'
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
      .bind('mgba-client', client)
      .bind('run-in-executor', createExecutor())
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
      .bind('mgba-client', client)
      .bind('run-in-executor', createExecutor())
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
