import type { z } from 'zod'

// MARK: Definitions

/** ツール環境 */
type ToolEnv = { Bindings: object }

/** ツールハンドラに渡されるコンテキスト */
type ToolContext<Input extends z.ZodType, Env extends ToolEnv> = {
  input: z.infer<Input>
  get: <Key extends keyof Env['Bindings']>(key: Key) => Env['Bindings'][Key]
}

/** ツールハンドラ */
type ToolHandler<
  Input extends z.ZodType,
  Output extends z.ZodType,
  Env extends ToolEnv,
> = (c: ToolContext<Input, Env>) => z.infer<Output> | Promise<z.infer<Output>>

/** ツール定義 */
type ToolDefinition<
  Input extends z.ZodType,
  Output extends z.ZodType,
  Env extends ToolEnv,
> = {
  input: Input
  output: Output
  handler: ToolHandler<Input, Output, Env>
}

// MARK: Utility Types

/** ツール環境をマージする Utility Type */
type MergeEnv<P extends ToolEnv, C extends ToolEnv> = Omit<
  P & C,
  'Bindings'
> & {
  Bindings: P['Bindings'] & C['Bindings']
}

/** バインディングを追加する Utility Type */
type WithBinding<Env extends ToolEnv, Key extends string, Value> = Omit<
  Env,
  'Bindings'
> & {
  Bindings: Env['Bindings'] & Record<Key, Value>
}

// MARK: Implementation

/** MCPツール */
export class McpTool<Env extends ToolEnv = ToolEnv> {
  private readonly tools: Map<string, ToolDefinition<z.ZodType, z.ZodType, Env>>

  private bindings: Record<string, unknown>

  public constructor() {
    this.tools = new Map()
    this.bindings = {}
  }

  /**
   * ツールを登録する
   * @param name ツール名
   * @param input 入力スキーマ
   * @param output 出力スキーマ
   * @param handler ツールハンドラ
   * @returns ツールの登録されたMcpToolインスタンス
   */
  public register<Input extends z.ZodType, Output extends z.ZodType>(
    name: string,
    input: Input,
    output: Output,
    handler: ToolHandler<Input, Output, Env>,
  ) {
    this.tools.set(name, {
      input,
      output,
      handler,
    })

    return this
  }

  /**
   * ツールにコンテキストをバインドする
   * @param key バインド名
   * @param value バインドする値
   * @returns コンテキストのバインドされたMcpToolインスタンス
   * @description バインドしたコンテキストは、ハンドラ内で `c.get()` により取得できます。
   */
  public bind<const Key extends string, Value>(key: Key, value: Value) {
    this.bindings[key] = value
    return this as unknown as McpTool<WithBinding<Env, Key, Value>>
  }

  /**
   * 別のMcpToolインスタンスを結合する
   * @param child 結合するMcpToolインスタンス
   * @returns サブインスタンスの結合されたMcpToolインスタンス
   * @description バインドされたコンテキストは引き継がれます。
   */
  public route<ChildEnv extends ToolEnv>(child: McpTool<ChildEnv>) {
    const childBindingKeys = Object.keys(child.bindings)
    for (const key of childBindingKeys) {
      this.bindings[key] = child.bindings[key]
    }

    const combinedTools = this.tools as unknown as Map<
      string,
      ToolDefinition<z.ZodType, z.ZodType, MergeEnv<Env, ChildEnv>>
    >

    for (const [key, tool] of child.tools) {
      if (combinedTools.has(key)) {
        throw new Error('ツール名が重複しています', { cause: { key } })
      }

      combinedTools.set(
        key,
        tool as unknown as ToolDefinition<
          z.ZodType,
          z.ZodType,
          MergeEnv<Env, ChildEnv>
        >,
      )
    }

    return this as unknown as McpTool<MergeEnv<Env, ChildEnv>>
  }
}
