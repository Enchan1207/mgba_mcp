import { ServerDisconnectedError } from './errors'

/**
 * バイトストリームから指定長のバイト列を順次取り出すリーダー
 *
 * @description 読み取り後に残ったバイト列は次回の読み取りに持ち越します。
 */
export class SocketReader {
  private remaining = Buffer.alloc(0)

  constructor(private readonly source: AsyncIterator<Buffer>) {}

  /**
   * 指定したバイト数を読み取る
   *
   * @param length 読み取るバイト数
   * @returns 指定した長さのバイト列
   * @throws {ServerDisconnectedError} 指定したバイト数を読み取る前に接続が切断された場合
   */
  async readExactly(length: number): Promise<Buffer> {
    while (this.remaining.length < length) {
      const next = await this.source.next()

      if (next.done) {
        throw new ServerDisconnectedError('接続が切断されました')
      }

      this.remaining = Buffer.concat([this.remaining, next.value])
    }

    const result = this.remaining.subarray(0, length)
    this.remaining = this.remaining.subarray(length)

    return result
  }
}
