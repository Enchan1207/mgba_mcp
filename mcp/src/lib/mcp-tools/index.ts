import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'

// MARK: Definitions

type InputType = z.ZodObject
type OutputType = z.ZodObject

/** ツール環境 */
type ToolEnv = { Bindings: object }

/** ツールハンドラに渡されるコンテキスト */
type ToolContext<Input extends InputType, Env extends ToolEnv> = {
  input: z.infer<Input>
  get: <Key extends keyof Env['Bindings']>(key: Key) => Env['Bindings'][Key]
}

/** ツール構成 */
type ToolConfig<Input extends InputType, Output extends OutputType> = {
  title: string
  description: string
  input: Input
  output: Output
}

/** ツールハンドラ */
type ToolHandler<
  Input extends InputType,
  Output extends OutputType,
  Env extends ToolEnv,
> = (c: ToolContext<Input, Env>) => z.infer<Output> | Promise<z.infer<Output>>

/** ツール定義 */
type ToolDefinition<
  Input extends InputType,
  Output extends OutputType,
  Env extends ToolEnv,
> = ToolConfig<Input, Output> & {
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
  private readonly tools: Map<
    string,
    ToolDefinition<InputType, OutputType, Env>
  >

  private bindings: Record<string, unknown>

  public constructor() {
    this.tools = new Map()
    this.bindings = {}
  }

  /**
   * ツールを登録する
   * @param name ツール名
   * @param props ツール構成とハンドラ
   * @returns ツールの登録されたMcpToolインスタンス
   */
  public register<Input extends InputType, Output extends OutputType>(
    name: string,
    props: {
      title: string
      description: string
      input: Input
      output: Output
      handler: ToolHandler<Input, Output, Env>
    },
  ) {
    this.tools.set(name, {
      title: props.title,
      description: props.description,
      input: props.input,
      output: props.output,
      handler: props.handler,
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
      ToolDefinition<InputType, OutputType, MergeEnv<Env, ChildEnv>>
    >

    for (const [key, tool] of child.tools) {
      if (combinedTools.has(key)) {
        throw new Error('ツール名が重複しています', { cause: { key } })
      }

      combinedTools.set(
        key,
        tool as unknown as ToolDefinition<
          InputType,
          OutputType,
          MergeEnv<Env, ChildEnv>
        >,
      )
    }

    return this as unknown as McpTool<MergeEnv<Env, ChildEnv>>
  }

  public mount(server: McpServer) {
    for (const [name, definition] of this.tools) {
      server.registerTool(
        name,
        {
          title: definition.title,
          description: definition.description,
          inputSchema: definition.input,
          outputSchema: definition.output,
        },
        async (input) => {
          const context: ToolContext<typeof definition.input, Env> = {
            input,
            get: (key) => (this.bindings as unknown as Env['Bindings'])[key],
          }

          try {
            const result = await definition.handler(context)
            const parsed = definition.output.parse(result)

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(parsed),
                },
              ],
              structuredContent: parsed,
            }
          } catch (error: unknown) {
            return {
              content: [
                {
                  type: 'text',
                  text: String(error),
                },
              ],
              isError: true,
            }
          }
        },
      )
    }
  }
}
