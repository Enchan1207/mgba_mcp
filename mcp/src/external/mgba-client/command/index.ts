import { Result } from '@praha/byethrow'
import type { Brand } from 'src/lib/brand'
import { match } from 'ts-pattern'
import { z } from 'zod'

import { InvalidArgumentError } from './errors'

export type Button =
  | 'a'
  | 'b'
  | 'start'
  | 'select'
  | 'up'
  | 'down'
  | 'left'
  | 'right'

type HelloCommand = {
  verb: 'connect'
  args: ['control' | 'view']
}

type PressButtonCommand = {
  verb: 'press'
  args: [Button]
}

type ReleaseButtonCommand = {
  verb: 'release'
  args: [Button | 'all']
}

type TypeButtonCommand = {
  verb: 'type'
  args: [Button, number]
}

type StepFrameCommand = {
  verb: 'step'
  args: [number]
}

type ReadMemoryCommand = {
  verb: 'read'
  args: [number, number]
}

type ResetCommand = {
  verb: 'reset'
}

type GetStatusCommand = {
  verb: 'status'
}

type CaptureCommand = {
  verb: 'capture'
}

type WaitCommand = {
  verb: 'wait_frame'
  args: [number]
}

type QuitCommand = {
  verb: 'quit'
}

export type MgbaServerCommand =
  | HelloCommand
  | PressButtonCommand
  | ReleaseButtonCommand
  | TypeButtonCommand
  | StepFrameCommand
  | ReadMemoryCommand
  | ResetCommand
  | GetStatusCommand
  | CaptureCommand
  | WaitCommand
  | QuitCommand

export type MgbaServerParsedCommand = Brand<
  string,
  'mgba_server_parsed_command'
>

const FrameCountSchema = z.number().int().min(1).max(18000)

const ReadArgumentsSchema = z
  .tuple([
    z.number().int().min(0).max(65535),
    z.number().int().min(1).max(65536),
  ])
  .refine(([address, length]) => address + length <= 65536)

const WaitTimeoutSchema = z.number().int().min(1).max(120000)

export const parseCommand = (
  command: MgbaServerCommand,
): Result.Result<MgbaServerParsedCommand, InvalidArgumentError> =>
  Result.pipe(
    match(command)
      .with({ verb: 'connect' }, ({ args }) =>
        Result.succeed(`HELLO ${args[0].toUpperCase()}`),
      )
      .with({ verb: 'press' }, ({ args }) =>
        Result.succeed(`PRESS ${args[0].toUpperCase()}`),
      )
      .with({ verb: 'release' }, ({ args }) =>
        Result.succeed(`RELEASE ${args[0].toUpperCase()}`),
      )
      .with({ verb: 'type' }, ({ args }) =>
        FrameCountSchema.safeParse(args[1]).success
          ? Result.succeed(`TYPE ${args[0].toUpperCase()} ${args[1]}`)
          : Result.fail(
              new InvalidArgumentError('コマンドの引数が不正です', {
                cause: { command },
              }),
            ),
      )
      .with({ verb: 'step' }, ({ args }) =>
        FrameCountSchema.safeParse(args[0]).success
          ? Result.succeed(`STEP ${args[0]}`)
          : Result.fail(
              new InvalidArgumentError('コマンドの引数が不正です', {
                cause: { command },
              }),
            ),
      )
      .with({ verb: 'read' }, ({ args }) =>
        ReadArgumentsSchema.safeParse(args).success
          ? Result.succeed(
              `READ ${args[0].toString(16).toUpperCase()} ${args[1]}`,
            )
          : Result.fail(
              new InvalidArgumentError('コマンドの引数が不正です', {
                cause: { command },
              }),
            ),
      )
      .with({ verb: 'reset' }, () => Result.succeed('RESET'))
      .with({ verb: 'status' }, () => Result.succeed('STATUS'))
      .with({ verb: 'capture' }, () => Result.succeed('CAPTURE'))
      .with({ verb: 'wait_frame' }, ({ args }) =>
        WaitTimeoutSchema.safeParse(args[0]).success
          ? Result.succeed(`WAIT_FRAME ${args[0]}`)
          : Result.fail(
              new InvalidArgumentError('コマンドの引数が不正です', {
                cause: { command },
              }),
            ),
      )
      .with({ verb: 'quit' }, () => Result.succeed('QUIT'))
      .exhaustive(),
    Result.map((body) => `${body}\n` as MgbaServerParsedCommand),
  )
