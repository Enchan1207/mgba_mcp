import { describe, expect, test } from 'vitest'

import { createReadScreenText } from '.'

const header = (revision = 0): Uint8Array => {
  const bytes = new Uint8Array(28)
  bytes.set(Buffer.from('POKEMON RED', 'ascii'))
  bytes[0x14c - 0x134] = revision
  let checksum = 0
  for (let i = 0; i <= 0x14c - 0x134; i += 1) {
    checksum = (checksum - (bytes[i] ?? 0) - 1) & 0xff
  }
  bytes[0x14d - 0x134] = checksum
  return bytes
}

describe('read-screen-text', () => {
  test.each([0, 1])('日本版赤 revision %i のWRAMタイルを復号する', async (revision) => {
    const calls: [number, number][] = []
    const tiles = new Uint8Array(360).fill(0x7f)
    tiles[13 * 20 + 2] = 0xe5 // dakuten above か
    tiles[14 * 20 + 2] = 0xb6
    tiles[14 * 20 + 4] = 0xcd // へ / ヘ
    tiles[16 * 20 + 1] = 0xb1 // あ
    tiles[16 * 20 + 2] = 0x79 // box corner -> space
    const read = async (address: number, length: number): Promise<Uint8Array> => {
      calls.push([address, length])
      return address === 0x134 ? header(revision) : tiles
    }
    const result = await createReadScreenText(read)()
    expect(calls).toEqual([[0x134, 28], [0xc3a0, 360]])
    expect(result?.lines).toEqual([
      { y: 14, text: '  が へ' + ' '.repeat(15) },
      { y: 16, text: ' あ' + ' '.repeat(18) },
    ])
  })

  test('半濁点を合成し、合成不能な濁点は維持する', async () => {
    const tiles = new Uint8Array(360).fill(0x7f)
    tiles[2 * 20] = 0xe4
    tiles[3 * 20] = 0xca
    tiles[2 * 20 + 1] = 0xe5
    tiles[3 * 20 + 1] = 0xb1
    const read = async (address: number): Promise<Uint8Array> =>
      address === 0x134 ? header() : tiles
    const result = await createReadScreenText(read)()
    expect(result?.lines).toEqual([
      { y: 2, text: ' ゛' + ' '.repeat(18) },
      { y: 3, text: 'ぱあ' + ' '.repeat(18) },
    ])
  })

  test('未対応ROMはタイル配列を読み出さない', async () => {
    const calls: number[] = []
    const read = async (address: number, length: number): Promise<Uint8Array> => {
      calls.push(address)
      return new Uint8Array(length)
    }
    expect(await createReadScreenText(read)()).toBeUndefined()
    expect(calls).toEqual([0x134])
  })

  test('読み出しエラーは伝播する', async () => {
    const read = async (): Promise<Uint8Array> => {
      throw new Error('read failed')
    }
    await expect(createReadScreenText(read)()).rejects.toThrow('read failed')
  })
})
