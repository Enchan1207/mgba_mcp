// oxlint-disable no-bitwise, id-length -- packed binary formats and map coordinate keys
import { decodeJapaneseGlyph } from '../read-screen-text'
import itemNames from './data/items.json'
import moveNames from './data/moves.json'
import speciesNames from './data/species.json'

// Japanese Pokémon Red (v1.0/v1.1) WRAM state readers.
// Address reference: https://flag3.github.io/blog/posts/ram-writer-in-pokemon-gen-1-en/
export type ReadMemory = (
  address: number,
  length: number,
) => Promise<Uint8Array>

const HEADER = 0x134
const HEADER_LENGTH = 28

const readExact = async (read: ReadMemory, address: number, length: number) => {
  const data = await read(address, length)
  if (data.length !== length) {
    throw new Error(
      `メモリ読み出し長が不正です: ${address.toString(16)} (${data.length}/${length})`,
    )
  }
  return data
}

const supported = async (read: ReadMemory) => {
  const header = await readExact(read, HEADER, HEADER_LENGTH)
  const title = Buffer.from(header.subarray(0, 16))
  if (
    title.subarray(0, 11).toString('ascii') !== 'POKEMON RED' ||
    !title.subarray(11).every((value) => value === 0) ||
    header[0x14a - HEADER] !== 0 ||
    ![0, 1].includes(header[0x14c - HEADER] ?? -1)
  ) {
    return false
  }
  let checksum = 0
  for (let index = 0; index <= 0x14c - HEADER; index += 1) {
    checksum = (checksum - (header[index] ?? 0) - 1 + 256) % 256
  }
  return checksum === header[0x14d - HEADER]
}

export const decodeName = (data: Uint8Array) => {
  const chars: string[] = []
  for (const byte of data) {
    if (byte === 0x50 || byte === 0x00) {
      break
    }
    chars.push(
      decodeJapaneseGlyph(byte) ?? `\\x${byte.toString(16).padStart(2, '0')}`,
    )
  }
  return chars.join('')
}

const u16 = (data: Uint8Array, offset: number) =>
  ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0)

export const decodeBcd = (bytes: Uint8Array) => {
  let value = 0
  for (const byte of bytes) {
    const high = byte >>> 4,
      low = byte & 15
    if (high > 9 || low > 9) {
      throw new Error('BCD表現が不正です')
    }
    value = value * 100 + high * 10 + low
  }
  return value
}

// Japanese Red uses internal species IDs, not National Pokédex numbers.
// Unknown IDs (including MissingNo.) have no localized name.
const lookupName = (table: Record<string, string>, id: number): string | null =>
  Object.hasOwn(table, id) ? (table[String(id)] ?? null) : null

export const speciesName = (id: number): string | null =>
  lookupName(speciesNames, id)

export const moveName = (id: number): string | null => lookupName(moveNames, id)

export const itemName = (id: number): string | null => lookupName(itemNames, id)

export const readPlayerState = async (read: ReadMemory) => {
  if (!(await supported(read))) {
    return null
  }
  const [name, location, money, badges] = await Promise.all([
    readExact(read, 0xd11d, 6),
    readExact(read, 0xd2dd, 5),
    readExact(read, 0xd2cb, 3),
    readExact(read, 0xd2d5, 1),
  ])
  const flags = badges[0] ?? 0
  return {
    name: decodeName(name),
    mapId: location[0] ?? 0,
    x: location[4] ?? 0,
    y: location[3] ?? 0,
    money: decodeBcd(money),
    badges: Array.from(
      { length: 8 },
      (_unused, index) => (flags & (1 << index)) !== 0,
    ),
  }
}

export const readPartyState = async (read: ReadMemory) => {
  if (!(await supported(read))) {
    return null
  }
  const heading = await readExact(read, 0xd123, 8)
  const count = heading[0] ?? 0
  if (count > 6) {
    throw new Error(`手持ち数が不正です: ${count}`)
  }
  if (heading[count + 1] !== 0xff) {
    throw new Error('手持ち終端が不正です')
  }
  if (count === 0) {
    return {
      pokemon: [],
      warning: '戦闘中のHP・PPは手持ち領域に未反映の場合があります',
    }
  }
  const [entries, nicknames] = await Promise.all([
    readExact(read, 0xd12b, count * 44),
    readExact(read, 0xd257, count * 6),
  ])
  const pokemon = Array.from({ length: count }, (_unused, index) => {
    const mon = entries.subarray(index * 44, (index + 1) * 44)
    const speciesId = mon[0] ?? 0
    if (speciesId !== heading[index + 1]) {
      throw new Error('手持ち種族IDが一致しません')
    }
    const moves = Array.from({ length: 4 }, (_unusedMove, slot) => {
      const moveId = mon[8 + slot] ?? 0
      if (moveId === 0) {
        return null
      }
      return {
        id: moveId,
        name: moveName(moveId),
        pp: (mon[29 + slot] ?? 0) & 0x3f,
        ppUps: (mon[29 + slot] ?? 0) >>> 6,
      }
    }).filter((move) => move !== null)
    const hp = u16(mon, 1),
      maxHp = u16(mon, 34)
    return {
      position: index,
      speciesId,
      species: speciesName(speciesId),
      nickname: decodeName(nicknames.subarray(index * 6, (index + 1) * 6)),
      level: mon[33] ?? 0,
      hp,
      maxHp,
      status: mon[4] ?? 0,
      moves,
    }
  })
  return {
    pokemon,
    warning: '戦闘中のHP・PPは手持ち領域に未反映の場合があります',
  }
}

export const readBagState = async (read: ReadMemory) => {
  if (!(await supported(read))) {
    return null
  }
  const countBytes = await readExact(read, 0xd2a1, 1)
  const count = countBytes[0] ?? 0
  if (count > 20) {
    throw new Error(`バッグの道具数が不正です: ${count}`)
  }
  if (count === 0) {
    return { items: [] }
  }
  const entries = await readExact(read, 0xd2a2, count * 2 + 1)
  if (entries[count * 2] !== 0xff) {
    throw new Error('バッグ終端が不正です')
  }
  return {
    items: Array.from({ length: count }, (_, index) => {
      const itemId = entries[index * 2] ?? 0,
        quantity = entries[index * 2 + 1] ?? 0
      if (itemId === 0 || itemId === 0xff || quantity === 0) {
        throw new Error('バッグの道具データが不正です')
      }
      return { position: index, id: itemId, name: itemName(itemId), quantity }
    }),
  }
}
