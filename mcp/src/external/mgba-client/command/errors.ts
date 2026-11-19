import { MgbaClientError } from '../errors'

/** 不正な引数 */
export class InvalidArgumentError extends MgbaClientError {
  public readonly code = 'mgba_client.invalid_argument'

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidArgumentError'
  }
}
