import type { z } from 'zod'

export type ToolResult = {
  content: (
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mimeType: string }
  )[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export type Command = (command: string) => Promise<Buffer>

export type ToolConnection = {
  command: Command
  runOperation: <T>(operation: () => Promise<T>) => Promise<T>
}

export type ToolDefinition<Input extends z.ZodObject<z.ZodRawShape>> = {
  name: string
  description: string
  inputSchema: Input
  outputSchema?: z.ZodObject<z.ZodRawShape>
  execute: (input: z.output<Input>) => Promise<ToolResult>
}

export const defineTool = <Input extends z.ZodObject<z.ZodRawShape>>(
  definition: ToolDefinition<Input>,
): ToolDefinition<Input> => definition
