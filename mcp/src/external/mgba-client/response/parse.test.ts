import { describe, expect, test } from 'vitest'

import { UnexpectedResponseFormatError } from './errors'
import { createSucceededResponseParser } from './parse'

describe('createSucceededResponseParser', () => {
  describe('STATUS応答', () => {
    test('経過フレーム数と押下ボタンと画面状態を返す', () => {
      expect(
        createSucceededResponseParser({
          verb: 'status',
          responseRaw: Buffer.from(
            'frames=42 pressed_keys=133 has_frame=false',
            'ascii',
          ),
        }),
      ).toStrictEqual({
        verb: 'status',
        frames: 42,
        pressed: ['a', 'select', 'down'],
        hasFrame: false,
      })
    })

    test('安全な最大フレーム数を返す', () => {
      expect(
        createSucceededResponseParser({
          verb: 'status',
          responseRaw: Buffer.from(
            `frames=${Number.MAX_SAFE_INTEGER} pressed_keys=0 has_frame=true`,
            'ascii',
          ),
        }),
      ).toStrictEqual({
        verb: 'status',
        frames: Number.MAX_SAFE_INTEGER,
        pressed: [],
        hasFrame: true,
      })
    })

    test.each([
      'frames=42 has_frame=true pressed_keys=0',
      'frames=42 pressed_keys=0 has_frame=true ',
      'frames=42 pressed_keys=0 has_frame=true\n',
      'frames=42 pressed_keys=0 has_frame=yes',
      'frames=42 pressed_keys=0 has_frame=true extra=1',
    ])('形式が不正な本文を拒否する: %s', (body) => {
      expect(() =>
        createSucceededResponseParser({
          verb: 'status',
          responseRaw: Buffer.from(body, 'ascii'),
        }),
      ).toThrow(UnexpectedResponseFormatError)
    })

    test.each([
      'frames=9007199254740992 pressed_keys=0 has_frame=true',
      'frames=42 pressed_keys=256 has_frame=true',
    ])('扱えない数値を拒否する: %s', (body) => {
      expect(() =>
        createSucceededResponseParser({
          verb: 'status',
          responseRaw: Buffer.from(body, 'ascii'),
        }),
      ).toThrow(UnexpectedResponseFormatError)
    })
  })

  describe('CAPTURE応答', () => {
    test('フレーム番号と寸法とRGBX8888画素列を返す', () => {
      const pixels = Buffer.alloc(160 * 144 * 4)
      pixels.set([0x7f, 0x80, 0xff, 0], 0)
      const responseRaw = Buffer.alloc(10 + pixels.length)
      responseRaw.writeBigUInt64LE(42n, 0)
      responseRaw.writeUInt8(160, 8)
      responseRaw.writeUInt8(144, 9)
      pixels.copy(responseRaw, 10)

      expect(
        createSucceededResponseParser({ verb: 'capture', responseRaw }),
      ).toStrictEqual({
        verb: 'capture',
        frames: 42n,
        width: 160,
        height: 144,
        pixels,
      })
    })

    test('uint64の最大フレーム番号を保持する', () => {
      const responseRaw = Buffer.alloc(10 + 160 * 144 * 4)
      responseRaw.writeBigUInt64LE(0xffff_ffff_ffff_ffffn, 0)
      responseRaw.writeUInt8(160, 8)
      responseRaw.writeUInt8(144, 9)

      expect(
        createSucceededResponseParser({ verb: 'capture', responseRaw }).frames,
      ).toBe(0xffff_ffff_ffff_ffffn)
    })

    test.each([0, 9])('本文が%dバイトなら拒否する', (length) => {
      expect(() =>
        createSucceededResponseParser({
          verb: 'capture',
          responseRaw: Buffer.alloc(length),
        }),
      ).toThrow(UnexpectedResponseFormatError)
    })

    test.each([
      { width: 159, height: 144 },
      { width: 160, height: 145 },
    ])('寸法が$width×$heightなら拒否する', ({ width, height }) => {
      const responseRaw = Buffer.alloc(10 + width * height * 4)
      responseRaw.writeUInt8(width, 8)
      responseRaw.writeUInt8(height, 9)

      expect(() =>
        createSucceededResponseParser({ verb: 'capture', responseRaw }),
      ).toThrow(UnexpectedResponseFormatError)
    })

    test.each([10 + 160 * 144 * 4 - 1, 10 + 160 * 144 * 4 + 1])(
      '本文が%dバイトなら拒否する',
      (length) => {
        const responseRaw = Buffer.alloc(length)
        responseRaw.writeUInt8(160, 8)
        responseRaw.writeUInt8(144, 9)

        expect(() =>
          createSucceededResponseParser({ verb: 'capture', responseRaw }),
        ).toThrow(UnexpectedResponseFormatError)
      },
    )
  })
})
