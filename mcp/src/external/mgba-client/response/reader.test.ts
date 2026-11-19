import assert from 'node:assert/strict'

import { Result } from '@praha/byethrow'
import { beforeAll, describe, expect, test } from 'vitest'

import {
  CommandFailedError,
  TooLargeResponseError,
  UnexpectedResponseFormatError,
} from './errors'
import { createResponseReader } from './reader'

describe('createResponseParser', () => {
  describe.each([
    { name: 'バイナリの本文', body: Buffer.from([0, 0xff, 0x0a]) },
    { name: '空の本文', body: Buffer.alloc(0) },
    { name: 'サイズ上限の本文', body: Buffer.alloc(1_000_000, 0xab) },
  ])('正常応答の$name', ({ body }) => {
    const header = Buffer.alloc(5)
    header.write('S', 0)
    header.writeUInt32LE(body.length, 1)
    const chunks = [header, body, Buffer.from('\n')]
    const readLengths: number[] = []
    let readIndex = 0
    let actual: Awaited<ReturnType<ReturnType<typeof createResponseReader>>>

    beforeAll(async () => {
      const parser = createResponseReader({
        readExact: (length) => {
          readLengths.push(length)
          const chunk = chunks[readIndex]
          readIndex += 1
          assert.ok(chunk !== undefined)
          return Promise.resolve(chunk)
        },
      })
      actual = await parser()
    })

    test('本文をBufferとして返す', () => {
      expect(actual).toStrictEqual(Result.succeed(body))
    })

    test('ヘッダーと本文と終端を指定長で読む', () => {
      expect(readLengths).toStrictEqual([5, body.length, 1])
    })
  })

  describe('コマンド失敗の応答', () => {
    const body = Buffer.from('BAD_REQUEST', 'ascii')
    const header = Buffer.alloc(5)
    header.write('E', 0)
    header.writeUInt32LE(body.length, 1)
    const chunks = [header, body, Buffer.from('\n')]
    let readIndex = 0
    let actual: Awaited<ReturnType<ReturnType<typeof createResponseReader>>>

    beforeAll(async () => {
      const parser = createResponseReader({
        readExact: () => {
          const chunk = chunks[readIndex]
          readIndex += 1
          assert.ok(chunk !== undefined)
          return Promise.resolve(chunk)
        },
      })
      actual = await parser()
    })

    test('CommandFailedErrorをResult.failで返す', () => {
      assert.ok(Result.isFailure(actual))
      expect(actual.error).toBeInstanceOf(CommandFailedError)
    })

    test('失敗した応答の本文を保持する', () => {
      assert.ok(Result.isFailure(actual))
      assert.ok(actual.error instanceof CommandFailedError)
      expect(actual.error.response).toStrictEqual(body.toString('ascii'))
    })
  })

  describe('不正な結果コード', () => {
    const header = Buffer.alloc(5)
    header.write('X', 0)
    const readLengths: number[] = []
    let caught: unknown

    beforeAll(async () => {
      const parser = createResponseReader({
        readExact: (length) => {
          readLengths.push(length)
          return Promise.resolve(header)
        },
      })
      try {
        await parser()
      } catch (error) {
        caught = error
      }
    })

    test('形式エラーをthrowする', () => {
      expect(caught).toBeInstanceOf(UnexpectedResponseFormatError)
    })

    test('本文を読まない', () => {
      expect(readLengths).toStrictEqual([5])
    })
  })

  describe('サイズの上限を超える応答', () => {
    const header = Buffer.alloc(5)
    header.write('S', 0)
    header.writeUInt32LE(1_000_001, 1)
    const readLengths: number[] = []
    let actual: Awaited<ReturnType<ReturnType<typeof createResponseReader>>>

    beforeAll(async () => {
      const parser = createResponseReader({
        readExact: (length) => {
          readLengths.push(length)
          return Promise.resolve(header)
        },
      })
      actual = await parser()
    })

    test('TooLargeResponseErrorをResult.failで返す', () => {
      assert.ok(Result.isFailure(actual))
      expect(actual.error).toBeInstanceOf(TooLargeResponseError)
    })

    test('本文を読まない', () => {
      expect(readLengths).toStrictEqual([5])
    })
  })

  describe('終端が改行ではない応答', () => {
    const header = Buffer.alloc(5)
    header.write('S', 0)
    header.writeUInt32LE(1, 1)
    const chunks = [header, Buffer.from('A'), Buffer.from('!')]
    let readIndex = 0
    let caught: unknown

    beforeAll(async () => {
      const parser = createResponseReader({
        readExact: () => {
          const chunk = chunks[readIndex]
          readIndex += 1
          assert.ok(chunk !== undefined)
          return Promise.resolve(chunk)
        },
      })
      try {
        await parser()
      } catch (error) {
        caught = error
      }
    })

    test('形式エラーをthrowする', () => {
      expect(caught).toBeInstanceOf(UnexpectedResponseFormatError)
    })
  })
})
