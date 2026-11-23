import { describe, expect, test, vi } from 'vitest'

import type { ReadMemory } from '.'
import { createReadScreenText } from '.'

const makeHeader = (revision = 0): Uint8Array => {
  const bytes = new Uint8Array(28)
  bytes.set(Buffer.from('POKEMON RED', 'ascii'))
  bytes[0x14c - 0x134] = revision
  let checksum = 0
  for (let index = 0; index <= 0x14c - 0x134; index += 1) {
    checksum = (checksum - (bytes[index] ?? 0) - 1 + 256) % 256
  }
  bytes[0x14d - 0x134] = checksum
  return bytes
}

describe('read-screen-text', () => {
  test.each([0, 1])(
    '日本版赤 revision %i のWRAMタイルを復号する',
    async (revision) => {
      const tiles = new Uint8Array(360).fill(0x7f)
      tiles[13 * 20 + 2] = 0xe5
      tiles[14 * 20 + 2] = 0xb6
      tiles[14 * 20 + 4] = 0xcd
      tiles[16 * 20 + 1] = 0xb1
      tiles[16 * 20 + 2] = 0x79

      const readMemory = vi
        .fn<ReadMemory>()
        .mockResolvedValueOnce(makeHeader(revision))
        .mockResolvedValueOnce(tiles)
      const result = await createReadScreenText(readMemory)()

      expect({
        calls: readMemory.mock.calls,
        lines: result?.lines,
      }).toStrictEqual({
        calls: [
          [0x134, 28],
          [0xc3a0, 360],
        ],
        lines: [
          { 'y': 14, text: '  が へ'.padEnd(20, ' ') },
          { 'y': 16, text: ' あ'.padEnd(20, ' ') },
        ],
      })
    },
  )

  test('半濁点を合成し、合成不能な濁点は維持する', async () => {
    const tiles = new Uint8Array(360).fill(0x7f)
    tiles[2 * 20] = 0xe4
    tiles[3 * 20] = 0xca
    tiles[2 * 20 + 1] = 0xe5
    tiles[3 * 20 + 1] = 0xb1

    const readMemory = vi
      .fn<ReadMemory>()
      .mockResolvedValueOnce(makeHeader())
      .mockResolvedValueOnce(tiles)
    const result = await createReadScreenText(readMemory)()
    expect(result?.lines).toStrictEqual([
      { 'y': 2, text: ' ゛'.padEnd(20, ' ') },
      { 'y': 3, text: 'ぱあ'.padEnd(20, ' ') },
    ])
  })

  test('未対応ROMはタイル配列を読み出さない', async () => {
    const readMemory = vi
      .fn<ReadMemory>()
      .mockResolvedValueOnce(new Uint8Array(28))
    const result = await createReadScreenText(readMemory)()
    expect({
      result,
      calls: readMemory.mock.calls,
    }).toStrictEqual({
      result: undefined,
      calls: [[0x134, 28]],
    })
  })

  test('読み出しエラーは伝播する', async () => {
    const readMemory = vi
      .fn<ReadMemory>()
      .mockRejectedValueOnce(new Error('read failed'))
    await expect(createReadScreenText(readMemory)()).rejects.toThrow(
      'read failed',
    )
  })
})
