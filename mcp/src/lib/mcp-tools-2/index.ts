import { z } from 'zod'

type ToolEnv = { Bindings: object }

type ToolContext<Input extends z.ZodType, Env extends ToolEnv> = {
  input: z.infer<Input>
  get: <Key extends keyof Env['Bindings']>(key: Key) => Env['Bindings'][Key]
}

type ToolHandler<
  Input extends z.ZodType,
  Output extends z.ZodType,
  Env extends ToolEnv,
> = (c: ToolContext<Input, Env>) => z.infer<Output> | Promise<z.infer<Output>>

type ToolDefinition<
  Input extends z.ZodType,
  Output extends z.ZodType,
  Env extends ToolEnv,
> = {
  input: Input
  output: Output
  handler: ToolHandler<Input, Output, Env>
}

type WithBinding<Env extends ToolEnv, Key extends string, Value> = Omit<
  Env,
  'Bindings'
> & {
  Bindings: Env['Bindings'] & Record<Key, Value>
}

export class McpTool<Env extends ToolEnv = ToolEnv> {
  private readonly tools: Map<string, ToolDefinition<z.ZodType, z.ZodType, Env>>

  private bindings: Record<string, unknown>

  public constructor() {
    this.tools = new Map()
    this.bindings = {}
  }

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

  public bind<const Key extends string, Value>(
    key: Key,
    value: Value,
  ): McpTool<WithBinding<Env, Key, Value>> {
    this.bindings[key] = value

    return this as unknown as McpTool<WithBinding<Env, Key, Value>>
  }
}

// MARK: - impl

export const tool = new McpTool()
  .bind('test', (num: number) => num * 2)
  .register(
    'press_button',
    z.object({ button: z.string() }),
    z.object({ step: z.number() }),
    (c) => {
      const press = c.input.button
      console.log(press)

      const result = c.get('test')(2)

      return {
        step: result,
      }
    },
  )
