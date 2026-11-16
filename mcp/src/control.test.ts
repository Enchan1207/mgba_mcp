import { Readable } from 'node:stream'

import { beforeAll, describe, expect, test } from 'vitest'

import { parseTotalFrames } from './control'
import { SocketReader } from './lib/socket-reader/index'

describe('SocketReader', () => {
  let first: Buffer
  let second: Buffer
  let disconnected = false

  beforeAll(async () => {
    const reader = new SocketReader(
      Readable.from([Buffer.from([1, 2]), Buffer.from([3, 4, 5])])[
        Symbol.asyncIterator
      ](),
    )
    first = await reader.readExactly(3)
    second = await reader.readExactly(2)
    try {
      await reader.readExactly(1)
    } catch {
      disconnected = true
    }
  })

  test('分割された受信バイトを指定長で返す', () => {
    expect(first).toStrictEqual(Buffer.from([1, 2, 3]))
  })

  test('余剰バイトを次の読み取りに持ち越す', () => {
    expect(second).toStrictEqual(Buffer.from([4, 5]))
  })

  test('eOFを通知する', () => {
    expect(disconnected).toBe(true)
  })
})

describe('parseTotalFrames', () => {
  test('STATUSの累積フレーム数を返す', () => {
    expect(
      parseTotalFrames(Buffer.from('frames=42 pressed_keys=0 has_frame=true')),
    ).toBe(42)
  })

  test('ボタンが押されたままの状態を拒否する', () => {
    expect(() =>
      parseTotalFrames(Buffer.from('frames=42 pressed_keys=1 has_frame=true')),
    ).throws()
  })
})
