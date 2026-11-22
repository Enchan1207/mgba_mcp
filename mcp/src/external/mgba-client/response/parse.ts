import { match } from 'ts-pattern'

import type { Button, MgbaServerCommand } from '../command'
import { UnexpectedResponseFormatError } from './errors'

type ReadCommandResponse = {
  verb: 'read'
  memorySnapshot: Buffer
}

type StatusCommandResponse = {
  verb: 'status'
  frames: number
  pressed: Button[]
  hasFrame: boolean
}

type CaptureCommandResponse = {
  verb: 'capture'
  frames: number
  width: number
  height: number
  pixels: Buffer
}

type WaitFrameCommandResponse = {
  verb: 'wait_frame'
  rawScreenBuffer: Buffer
}

type MgbaServerSuceededResponse =
  | ReadCommandResponse
  | StatusCommandResponse
  | CaptureCommandResponse
  | WaitFrameCommandResponse

type NoResponseVerbs = Exclude<
  MgbaServerCommand['verb'],
  MgbaServerSuceededResponse['verb']
>

export type MgbaResponseTypeFor<V extends MgbaServerCommand['verb']> =
  V extends NoResponseVerbs
    ? undefined
    : Extract<MgbaServerSuceededResponse, { verb: V }>

const buttons: readonly Button[] = [
  'a',
  'b',
  'select',
  'start',
  'right',
  'left',
  'up',
  'down',
]

const CAPTURE_HEADER_LENGTH = 10
const CAPTURE_WIDTH = 160
const CAPTURE_HEIGHT = 144

const parseCaptureResponse = (responseRaw: Buffer): CaptureCommandResponse => {
  if (responseRaw.length < CAPTURE_HEADER_LENGTH) {
    throw new UnexpectedResponseFormatError('応答の長さが不正です')
  }

  const width = responseRaw.readUInt8(8)
  const height = responseRaw.readUInt8(9)
  if (
    width !== CAPTURE_WIDTH ||
    height !== CAPTURE_HEIGHT ||
    responseRaw.length !== CAPTURE_HEADER_LENGTH + width * height * 4
  ) {
    throw new UnexpectedResponseFormatError('画像の寸法または長さが不正です')
  }

  const frames = Number(responseRaw.readBigUInt64LE(0))
  if (!Number.isSafeInteger(frames)) {
    throw new UnexpectedResponseFormatError('応答の数値が範囲外です')
  }

  return {
    verb: 'capture',
    frames,
    width,
    height,
    pixels: responseRaw.subarray(CAPTURE_HEADER_LENGTH),
  }
}

const parseStatusResponse = (responseRaw: Buffer): StatusCommandResponse => {
  const responseText = responseRaw.toString('latin1')
  const fields =
    /^frames=(?<frames>\d+) pressed_keys=(?<pressedKeys>\d+) has_frame=(?<hasFrame>true|false)$/u.exec(
      responseText,
    )
  const framesText = fields?.groups?.['frames']
  const pressedKeysText = fields?.groups?.['pressedKeys']
  const hasFrameText = fields?.groups?.['hasFrame']
  if (
    fields?.[0] !== responseText ||
    framesText === undefined ||
    pressedKeysText === undefined ||
    hasFrameText === undefined
  ) {
    throw new UnexpectedResponseFormatError('応答の形式が不正です')
  }

  const frames = Number(framesText)
  const pressedKeys = Number(pressedKeysText)
  if (
    !Number.isSafeInteger(frames) ||
    !Number.isSafeInteger(pressedKeys) ||
    pressedKeys > 0xff
  ) {
    throw new UnexpectedResponseFormatError('応答の数値が範囲外です')
  }

  return {
    verb: 'status',
    frames,
    pressed: buttons.flatMap((button, index) =>
      Math.floor(pressedKeys / 2 ** index) % 2 === 1 ? [button] : [],
    ),
    hasFrame: hasFrameText === 'true',
  }
}

export function createSucceededResponseParser<
  V extends MgbaServerCommand['verb'],
>(props: { verb: V; responseRaw: Buffer }): MgbaResponseTypeFor<V>

export function createSucceededResponseParser(props: {
  verb: MgbaServerCommand['verb']
  responseRaw: Buffer
}): MgbaServerSuceededResponse | undefined {
  return match(props)
    .returnType<MgbaServerSuceededResponse | undefined>()
    .with({ verb: 'read' }, (readResponse) => ({
      verb: 'read',
      memorySnapshot: readResponse.responseRaw,
    }))
    .with({ verb: 'status' }, (statusResponse) =>
      parseStatusResponse(statusResponse.responseRaw),
    )
    .with({ verb: 'capture' }, (captureResponse) =>
      parseCaptureResponse(captureResponse.responseRaw),
    )
    .with({ verb: 'wait_frame' }, (waitFrameResponse) => ({
      verb: 'wait_frame',
      rawScreenBuffer: waitFrameResponse.responseRaw,
    }))
    .otherwise(() => undefined)
}
