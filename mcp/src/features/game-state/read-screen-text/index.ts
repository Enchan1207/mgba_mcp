// Japanese Pokemon Red: screen text is a best-effort decoding of the WRAM tile map.
// Character source: https://github.com/Narishma-gb/pokegreen/blob/master/constants/charmap.asm
export type ReadMemory = (address: number, length: number) => Promise<Uint8Array>
export type ScreenTextData = { lines: { 'y': number; text: string }[] }

const HEADER_START = 0x0134
const HEADER_LENGTH = 28
const TILE_MAP_START = 0xc3a0
const WIDTH = 20
const HEIGHT = 18

// The first non-control glyph wins when several Unicode characters share one tile.
const glyphs: Record<number, string> = {
  0x05: 'ガ',
  0x06: 'ギ',
  0x07: 'グ',
  0x08: 'ゲ',
  0x09: 'ゴ',
  0x0a: 'ザ',
  0x0b: 'ジ',
  0x0c: 'ズ',
  0x0d: 'ゼ',
  0x0e: 'ゾ',
  0x0f: 'ダ',
  0x10: 'ヂ',
  0x11: 'ヅ',
  0x12: 'デ',
  0x13: 'ド',
  0x19: 'バ',
  0x1a: 'ビ',
  0x1b: 'ブ',
  0x1c: 'ボ',
  0x26: 'が',
  0x27: 'ぎ',
  0x28: 'ぐ',
  0x29: 'げ',
  0x2a: 'ご',
  0x2b: 'ざ',
  0x2c: 'じ',
  0x2d: 'ず',
  0x2e: 'ぜ',
  0x2f: 'ぞ',
  0x30: 'だ',
  0x31: 'ぢ',
  0x32: 'づ',
  0x33: 'で',
  0x34: 'ど',
  0x3a: 'ば',
  0x3b: 'び',
  0x3c: 'ぶ',
  0x3d: 'べ',
  0x3e: 'ぼ',
  0x40: 'パ',
  0x41: 'ピ',
  0x42: 'プ',
  0x43: 'ポ',
  0x44: 'ぱ',
  0x45: 'ぴ',
  0x46: 'ぷ',
  0x47: 'ぺ',
  0x48: 'ぽ',
  0x60: 'Ａ',
  0x61: 'Ｂ',
  0x62: 'Ｃ',
  0x63: 'Ｄ',
  0x64: 'Ｅ',
  0x65: 'Ｆ',
  0x66: 'Ｇ',
  0x67: 'Ｈ',
  0x68: 'Ｉ',
  0x69: 'Ｖ',
  0x6a: 'Ｓ',
  0x6b: 'Ｌ',
  0x6c: 'Ｍ',
  0x6d: ':',
  0x6e: 'ぃ',
  0x6f: 'ぅ',
  0x70: '「',
  0x71: '」',
  0x72: '『',
  0x73: '』',
  0x74: '·',
  0x75: '⋯',
  0x76: 'ぁ',
  0x77: 'ぇ',
  0x78: 'ぉ',
  0x7f: ' ',
  0x80: 'ア',
  0x81: 'イ',
  0x82: 'ウ',
  0x83: 'エ',
  0x84: 'オ',
  0x85: 'カ',
  0x86: 'キ',
  0x87: 'ク',
  0x88: 'ケ',
  0x89: 'コ',
  0x8a: 'サ',
  0x8b: 'シ',
  0x8c: 'ス',
  0x8d: 'セ',
  0x8e: 'ソ',
  0x8f: 'タ',
  0x90: 'チ',
  0x91: 'ツ',
  0x92: 'テ',
  0x93: 'ト',
  0x94: 'ナ',
  0x95: 'ニ',
  0x96: 'ヌ',
  0x97: 'ネ',
  0x98: 'ノ',
  0x99: 'ハ',
  0x9a: 'ヒ',
  0x9b: 'フ',
  0x9c: 'ホ',
  0x9d: 'マ',
  0x9e: 'ミ',
  0x9f: 'ム',
  0xa0: 'メ',
  0xa1: 'モ',
  0xa2: 'ヤ',
  0xa3: 'ユ',
  0xa4: 'ヨ',
  0xa5: 'ラ',
  0xa6: 'ル',
  0xa7: 'レ',
  0xa8: 'ロ',
  0xa9: 'ワ',
  0xaa: 'ヲ',
  0xab: 'ン',
  0xac: 'ッ',
  0xad: 'ャ',
  0xae: 'ュ',
  0xaf: 'ョ',
  0xb0: 'ィ',
  0xb1: 'あ',
  0xb2: 'い',
  0xb3: 'う',
  0xb4: 'え',
  0xb5: 'お',
  0xb6: 'か',
  0xb7: 'き',
  0xb8: 'く',
  0xb9: 'け',
  0xba: 'こ',
  0xbb: 'さ',
  0xbc: 'し',
  0xbd: 'す',
  0xbe: 'せ',
  0xbf: 'そ',
  0xc0: 'た',
  0xc1: 'ち',
  0xc2: 'つ',
  0xc3: 'て',
  0xc4: 'と',
  0xc5: 'な',
  0xc6: 'に',
  0xc7: 'ぬ',
  0xc8: 'ね',
  0xc9: 'の',
  0xca: 'は',
  0xcb: 'ひ',
  0xcc: 'ふ',
  0xcd: 'へ',
  0xce: 'ほ',
  0xcf: 'ま',
  0xd0: 'み',
  0xd1: 'む',
  0xd2: 'め',
  0xd3: 'も',
  0xd4: 'や',
  0xd5: 'ゆ',
  0xd6: 'よ',
  0xd7: 'ら',
  0xd8: 'り',
  0xd9: 'る',
  0xda: 'れ',
  0xdb: 'ろ',
  0xdc: 'わ',
  0xdd: 'を',
  0xde: 'ん',
  0xdf: 'っ',
  0xe0: 'ゃ',
  0xe1: 'ゅ',
  0xe2: 'ょ',
  0xe3: 'ー',
  0xe4: '゜',
  0xe5: '゛',
  0xe6: '？',
  0xe7: '！',
  0xe8: '。',
  0xe9: 'ァ',
  0xea: 'ゥ',
  0xeb: 'ェ',
  0xef: '♂',
  0xf0: '円',
  0xf1: '×',
  0xf2: '．',
  0xf3: '／',
  0xf4: 'ォ',
  0xf5: '♀',
  0xf6: '０',
  0xf7: '１',
  0xf8: '２',
  0xf9: '３',
  0xfa: '４',
  0xfb: '５',
  0xfc: '６',
  0xfd: '７',
  0xfe: '８',
  0xff: '９',
}

const dakuten: Record<string, string> = {
  'か': 'が',
  'き': 'ぎ',
  'く': 'ぐ',
  'け': 'げ',
  'こ': 'ご',
  'さ': 'ざ',
  'し': 'じ',
  'す': 'ず',
  'せ': 'ぜ',
  'そ': 'ぞ',
  'た': 'だ',
  'ち': 'ぢ',
  'つ': 'づ',
  'て': 'で',
  'と': 'ど',
  'は': 'ば',
  'ひ': 'び',
  'ふ': 'ぶ',
  'へ': 'べ',
  'ほ': 'ぼ',
  'カ': 'ガ',
  'キ': 'ギ',
  'ク': 'グ',
  'ケ': 'ゲ',
  'コ': 'ゴ',
  'サ': 'ザ',
  'シ': 'ジ',
  'ス': 'ズ',
  'セ': 'ゼ',
  'ソ': 'ゾ',
  'タ': 'ダ',
  'チ': 'ヂ',
  'ツ': 'ヅ',
  'テ': 'デ',
  'ト': 'ド',
  'ハ': 'バ',
  'ヒ': 'ビ',
  'フ': 'ブ',
  'ヘ': 'ベ',
  'ホ': 'ボ',
}

const handakuten: Record<string, string> = {
  'は': 'ぱ',
  'ひ': 'ぴ',
  'ふ': 'ぷ',
  'へ': 'ぺ',
  'ほ': 'ぽ',
  'ハ': 'パ',
  'ヒ': 'ピ',
  'フ': 'プ',
  'ヘ': 'ペ',
  'ホ': 'ポ',
}

const diacritics: Record<number, Record<string, string>> = {
  0xe4: handakuten,
  0xe5: dakuten,
}

const isSupportedRom = (header: Uint8Array): boolean => {
  if (header.length !== HEADER_LENGTH) {
    throw new Error('ROMヘッダの長さが不正です')
  }

  const title = Buffer.from(header.subarray(0, 16))
  if (
    title.subarray(0, 11).toString('ascii') !== 'POKEMON RED' ||
    !title.subarray(11).every((value) => value === 0)
  ) {
    return false
  }

  const region = header[0x14a - HEADER_START]
  const version = header[0x14c - HEADER_START]
  if (region !== 0 || (version !== 0 && version !== 1)) {
    return false
  }

  let checksum = 0
  for (let index = 0; index <= 0x14c - HEADER_START; index += 1) {
    checksum = (checksum - (header[index] ?? 0) - 1 + 256) % 256
  }
  return checksum === header[0x14d - HEADER_START]
}

const decodeTileMap = (tiles: Uint8Array): ScreenTextData => {
  if (tiles.length !== WIDTH * HEIGHT) {
    throw new Error('画面タイル配列の長さが不正です')
  }

  const grid = Array.from({ length: HEIGHT }, (_unusedRow, rowIndex) =>
    Array.from(
      { length: WIDTH },
      (_unusedColumn, columnIndex) =>
        glyphs[tiles[rowIndex * WIDTH + columnIndex] ?? -1] ?? ' ',
    ),
  )

  for (let rowIndex = 0; rowIndex < HEIGHT - 1; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < WIDTH; columnIndex += 1) {
      const tile = tiles[rowIndex * WIDTH + columnIndex]
      const map = diacritics[tile ?? -1]
      if (map === undefined) {
        continue
      }

      const lowerRow = grid[rowIndex + 1]
      const upperRow = grid[rowIndex]
      if (lowerRow === undefined || upperRow === undefined) {
        continue
      }
      const base = lowerRow[columnIndex] ?? ' '
      const combined = map[base]
      if (combined === undefined) {
        continue
      }

      lowerRow[columnIndex] = combined
      upperRow[columnIndex] = ' '
    }
  }

  return {
    lines: grid.flatMap((row, rowIndex) => {
      const text = row.join('')
      return text.trim().length === 0 ? [] : [{ 'y': rowIndex, text }]
    }),
  }
}

export const createReadScreenText =
  (readMemory: ReadMemory): (() => Promise<ScreenTextData | undefined>) =>
  async () => {
    const header = await readMemory(HEADER_START, HEADER_LENGTH)
    if (!isSupportedRom(header)) {
      return undefined
    }
    const tiles = await readMemory(TILE_MAP_START, WIDTH * HEIGHT)
    return decodeTileMap(tiles)
  }
