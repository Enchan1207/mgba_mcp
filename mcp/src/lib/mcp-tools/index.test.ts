import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { beforeAll, describe, expect, test } from 'vitest'
import { z } from 'zod'

import { McpTool } from './index'

describe('McpToolの登録とマウント', () => {
  const input = z.object({ value: z.string() })
  const output = z.object({ result: z.string() })
  const registrations: {
    name: string
    config: unknown
    callback: (input: { value: string }) => Promise<CallToolResult>
  }[] = []
  const server = {
    registerTool: (
      name: string,
      config: unknown,
      callback: (input: { value: string }) => Promise<CallToolResult>,
    ) => {
      registrations.push({ name, config, callback })
    },
  } as unknown as McpServer
  const parent = new McpTool().bind('prefix', '親:').register('parent', {
    title: '親ツール',
    description: '親の説明',
    input,
    output,
    handler: (c) => ({ result: c.get('prefix') + c.input.value }),
  })
  const child = new McpTool().bind('suffix', ':子').register('child', {
    title: '子ツール',
    description: '子の説明',
    input,
    output,
    handler: (c) => ({
      result: c.input.value + c.get('suffix'),
      discarded: 'スキーマ外',
    }),
  })
  let parentResult: CallToolResult | undefined
  let childResult: CallToolResult | undefined

  beforeAll(async () => {
    parent.route(child).mount(server)
    parentResult = await registrations[0]?.callback({ value: 'A' })
    childResult = await registrations[1]?.callback({ value: 'B' })
  })

  test('親と子のツールを登録順にマウントする', () => {
    expect(registrations.map(({ name }) => name)).toStrictEqual([
      'parent',
      'child',
    ])
  })

  test('登録情報に表示名、説明、入出力スキーマを渡す', () => {
    expect(registrations[0]?.config).toMatchObject({
      title: '親ツール',
      description: '親の説明',
      inputSchema: input,
      outputSchema: output,
    })
  })

  test('親ツールが入力と親のバインディングを使って結果を返す', () => {
    expect(parentResult).toStrictEqual({
      content: [{ type: 'text', text: '{"result":"親:A"}' }],
      structuredContent: { result: '親:A' },
    })
  })

  test('子ツールが入力と子のバインディングを使い、検証済みの結果を返す', () => {
    expect(childResult).toStrictEqual({
      content: [{ type: 'text', text: '{"result":"B:子"}' }],
      structuredContent: { result: 'B:子' },
    })
  })
})

describe('McpToolの出力検証', () => {
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
      .register('invalid_output', {
        title: '出力検証',
        description: '不正な出力を検証する',
        input: z.object({}),
        output: z.object({ count: z.number().positive() }),
        handler: () => ({ count: -1 }),
      })
      .mount(server)
    actual = await callback?.()
  })

  test('スキーマに合わない出力をエラーとして返す', () => {
    expect(actual).toMatchObject({
      content: [{ type: 'text' }],
      isError: true,
    })
  })

  test('不正な出力を構造化結果に含めない', () => {
    expect(actual).not.toHaveProperty('structuredContent')
  })
})

describe('McpToolのハンドラエラー', () => {
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
      .register('failed', {
        title: '失敗するツール',
        description: '実行時の失敗を検証する',
        input: z.object({}),
        output: z.object({ result: z.string() }),
        handler: () => Promise.reject(new Error('実行に失敗しました')),
      })
      .mount(server)
    actual = await callback?.()
  })

  test('ハンドラの失敗をエラーとして返す', () => {
    expect(actual).toMatchObject({
      content: [{ type: 'text' }],
      isError: true,
    })
  })
})

describe('McpToolの重複検出', () => {
  test('親子でツール名が重複すると結合を拒否する', () => {
    const parent = new McpTool().register('duplicate', {
      title: '親ツール',
      description: '親の説明',
      input: z.object({}),
      output: z.object({}),
      handler: () => ({}),
    })
    const child = new McpTool().register('duplicate', {
      title: '子ツール',
      description: '子の説明',
      input: z.object({}),
      output: z.object({}),
      handler: () => ({}),
    })

    expect(() => parent.route(child)).toThrow(Error)
  })
})

describe('McpToolのルートバインディング', () => {
  test('子孫のツールがルートでバインドした値を取得する', async () => {
    let callback:
      | ((input: { value: string }) => Promise<CallToolResult>)
      | undefined
    const server = {
      registerTool: (
        _name: string,
        _config: unknown,
        handler: (input: { value: string }) => Promise<CallToolResult>,
      ) => {
        callback = handler
      },
    } as unknown as McpServer
    const child = new McpTool<{ Bindings: { prefix: string } }>().register(
      'child',
      {
        title: '子ツール',
        description: 'ルートのバインディングを使う',
        input: z.object({ value: z.string() }),
        output: z.object({ result: z.string() }),
        handler: (c) => ({ result: c.get('prefix') + c.input.value }),
      },
    )
    new McpTool()
      .route(new McpTool<{ Bindings: { prefix: string } }>().route(child))
      .bind('prefix', '値:')
      .mount(server)

    await expect(callback?.({ value: 'A' })).resolves.toMatchObject({
      structuredContent: { result: '値:A' },
    })
  })
})
