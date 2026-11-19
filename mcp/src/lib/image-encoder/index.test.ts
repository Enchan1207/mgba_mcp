import sharp from 'sharp'
import { beforeAll, describe, expect, test } from 'vitest'
import { ZodError } from 'zod'

import type { ImageScale } from '.'
import { encodePng } from '.'

describe.each([1, 2, 4] as const)('encodePngの倍率%d', (scale) => {
  const image = {
    frames: 42n,
    width: 2,
    height: 1,
    pixels: Buffer.from([255, 0, 0, 0, 0, 0, 255, 0]),
  }
  let png: Buffer
  let decoded: {
    data: Buffer
    info: { width: number; height: number; channels: number }
  }

  beforeAll(async () => {
    png = await encodePng(image, scale)
    decoded = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  })

  test('PNG形式のBufferを返す', () => {
    expect(png.subarray(0, 8)).toStrictEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  })

  test('指定倍率の寸法で返す', () => {
    expect(decoded.info).toMatchObject({
      width: 2 * scale,
      height: scale,
      channels: 3,
    })
  })

  test('未使用のXを透過扱いせず最近傍で拡大する', () => {
    const row = [
      ...Array.from({ length: scale }, () => [255, 0, 0]).flat(),
      ...Array.from({ length: scale }, () => [0, 0, 255]).flat(),
    ]
    const expected = Buffer.from(
      Array.from({ length: scale }, () => row).flat(),
    )

    expect(decoded.data).toStrictEqual(expected)
  })
})

describe('encodePngの入力検証', () => {
  let invalidDimensionsError: unknown
  let invalidPixelsError: unknown
  let invalidScaleError: unknown

  beforeAll(async () => {
    try {
      await encodePng({ width: 0, height: 1, pixels: Buffer.alloc(0) }, 1)
    } catch (error) {
      invalidDimensionsError = error
    }

    try {
      await encodePng({ width: 2, height: 1, pixels: Buffer.alloc(7) }, 1)
    } catch (error) {
      invalidPixelsError = error
    }

    try {
      await encodePng(
        { width: 1, height: 1, pixels: Buffer.alloc(4) },
        3 as ImageScale,
      )
    } catch (error) {
      invalidScaleError = error
    }
  })

  test('寸法が不正なら拒否する', () => {
    expect(invalidDimensionsError).toBeInstanceOf(ZodError)
  })

  test('画素数が寸法と一致しなければ拒否する', () => {
    expect(invalidPixelsError).toBeInstanceOf(ZodError)
  })

  test('指定外の倍率を拒否する', () => {
    expect(invalidScaleError).toBeInstanceOf(ZodError)
  })
})
