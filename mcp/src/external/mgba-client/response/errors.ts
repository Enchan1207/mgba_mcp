import { MgbaClientError } from '../errors'

/** 予期せぬフォーマットでの応答 */
export class UnexpectedResponseFormatError extends MgbaClientError {
  public readonly code = 'mgba_client.unexpected_response_format'

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'UnexpectedResponseFormatError'
  }
}

/** コマンドの実行結果としてエラーを受け取った */
export class CommandFailedError extends MgbaClientError {
  public readonly code = 'mgba_client.command_failed'

  public readonly response: string

  public constructor(
    message: string,
    options: ErrorOptions & { response: string },
  ) {
    super(message, options)
    this.name = 'CommandFailedError'
    this.response = options.response
  }
}

/** レスポンスサイズが大きすぎる */
export class TooLargeResponseError extends MgbaClientError {
  public readonly code = 'mgba_client.response_too_large'

  public readonly size: number

  public constructor(
    message: string,
    options: ErrorOptions & { size: number },
  ) {
    super(message, options)
    this.name = 'TooLargeResponseError'
    this.size = options.size
  }
}
