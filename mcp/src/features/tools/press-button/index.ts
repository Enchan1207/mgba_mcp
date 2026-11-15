import { z } from 'zod'
import { parseTotalFrames } from '../../../control.js'
import { defineTool, type Command } from '../../../lib/tool/index.js'

const inputSchema = z.object({
  button: z.enum(['A', 'B', 'SELECT', 'START', 'RIGHT', 'LEFT', 'UP', 'DOWN']),
  frames: z.number().int().min(1).max(18000).default(10),
})

const outputSchema = z.object({
  framesAdvanced: z.number().int(),
  totalFrames: z.number().int(),
})

export const createPressButtonTool = (command: Command) =>
  defineTool({
    name: 'press_button',
    description:
      'Press a Game Boy button, then release all buttons for the same number of frames.',
    inputSchema,
    outputSchema,
    execute: async ({ button, frames }) => {
      try {
        await command('RELEASE ALL')
        await command(`TYPE ${button} ${frames}`)
        const totalFrames = parseTotalFrames(await command('STATUS'))
        const result = { framesAdvanced: frames * 2, totalFrames }
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        }
      } catch (error) {
        let releaseStatus = ''
        try {
          await command('RELEASE ALL')
        } catch {
          releaseStatus = '; button release could not be confirmed'
        }
        return {
          content: [
            {
              type: 'text',
              text: `${String(error)}; frames advanced may be unknown${releaseStatus}`,
            },
          ],
          isError: true,
        }
      }
    },
  })
