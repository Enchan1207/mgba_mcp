// oxlint-disable id-length -- Map coordinate keys follow the MCP schema
import { describe, expect, test, vi } from 'vitest'

import type { ReadMemory } from '.'
import {
  decodeBcd,
  decodeName,
  itemName,
  moveName,
  readBagState,
  readPartyState,
  readPlayerState,
  speciesName,
} from '.'

const header = (revision = 0) => {
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

const fixture = (memory: Map<number, Uint8Array>): ReadMemory =>
  vi.fn<ReadMemory>((address, length) => {
    if (address === 0x134) { return Promise.resolve(header()) }
    const bytes = memory.get(address)
    if (!bytes) { return Promise.reject(new Error(`unexpected READ ${address.toString(16)}`)) }
    return Promise.resolve(bytes.subarray(0, length))
  })

describe('Japanese Pokémon Red state decoding', () => {
  test.each([
    ['valid BCD', () => decodeBcd(Uint8Array.of(0x12, 0x34, 0x56)), 123456],
    ['Japanese name', () => decodeName(Uint8Array.of(0x80, 0xb1, 0x50, 0x80)), 'アあ'],
    ['Mew species', () => speciesName(0x15), 'Mew'],
    ['unknown species', () => speciesName(0), null],
    ['Tackle move', () => moveName(0x21), 'Tackle'],
    ['unknown move', () => moveName(255), null],
    ['rare candy', () => itemName(0x28), 'Rare Candy'],
    ['HM01', () => itemName(0xc4), 'HM01'],
  ] as const)('%s', (_description, decode, expected) => {
    expect(decode()).toBe(expected)
  })

  test('不正なBCDを拒否する', () => {
    expect(() => decodeBcd(Uint8Array.of(0xfa))).toThrow('BCD')
  })

  test('プレイヤー: 座標、所持金、バッジ', async () => {
    const read = fixture(new Map([
      [0xd11d, Uint8Array.of(0x80, 0xb1, 0x50, 0, 0, 0)],
      [0xd2dd, Uint8Array.of(3, 0, 0, 7, 9)],
      [0xd2cb, Uint8Array.of(0x01, 0x23, 0x45)],
      [0xd2d5, Uint8Array.of(0x81)],
    ]))
    await expect(readPlayerState(read)).resolves.toStrictEqual({
      name: 'アあ', mapId: 3, x: 9, y: 7, money: 12345,
      badges: [true, false, false, false, false, false, false, true],
    })
  })

  test('手持ち: 技とPP、名前を取得する', async () => {
    const entry = new Uint8Array(44)
    entry[0] = 0x15
    entry.set([0, 23], 1)
    entry[8] = 33
    entry[29] = 0x4a
    entry[33] = 7
    entry.set([0, 29], 34)
    const read = fixture(new Map([
      [0xd123, Uint8Array.of(1, 0x15, 0xff, 0, 0, 0, 0, 0)],
      [0xd12b, entry],
      [0xd257, Uint8Array.of(0x80, 0x50, 0, 0, 0, 0)],
    ]))
    await expect(readPartyState(read)).resolves.toStrictEqual({
      pokemon: [{
        position: 0, speciesId: 0x15, species: 'Mew', nickname: 'ア',
        level: 7, hp: 23, maxHp: 29, status: 0,
        moves: [{ id: 33, name: 'Tackle', pp: 10, ppUps: 1 }],
      }],
      warning: '戦闘中のHP・PPは手持ち領域に未反映の場合があります',
    })
  })

  test('バッグ: 並び順を保存する', async () => {
    const read = fixture(new Map([
      [0xd2a1, Uint8Array.of(2)],
      [0xd2a2, Uint8Array.of(0x28, 9, 0x04, 5, 0xff)],
    ]))
    await expect(readBagState(read)).resolves.toStrictEqual({
      items: [
        { position: 0, id: 40, name: 'Rare Candy', quantity: 9 },
        { position: 1, id: 4, name: 'Poké Ball', quantity: 5 },
      ],
    })
  })

  test('空の手持ちとバッグ', async () => {
    const read = fixture(new Map([
      [0xd123, Uint8Array.of(0, 0xff, 0, 0, 0, 0, 0, 0)],
      [0xd2a1, Uint8Array.of(0)],
    ]))
    await expect(Promise.all([readPartyState(read), readBagState(read)])).resolves.toStrictEqual([
      { pokemon: [], warning: '戦闘中のHP・PPは手持ち領域に未反映の場合があります' },
      { items: [] },
    ])
  })

  test('未対応ROMでは状態を読まない', async () => {
    const unsupported = vi.fn<ReadMemory>(() => Promise.resolve(new Uint8Array(28)))
    await expect(readPlayerState(unsupported)).resolves.toBeNull()
  })

  test('破損したバッグを拒否する', async () => {
    const corrupt = fixture(new Map([[0xd2a1, Uint8Array.of(21)]]))
    await expect(readBagState(corrupt)).rejects.toThrow('バッグの道具数')
  })

  test('通信エラーは伝播する', async () => {
    const failure = vi.fn<ReadMemory>(() => Promise.reject(new Error('socket closed')))
    await expect(readPlayerState(failure)).rejects.toThrow('socket closed')
  })
})
