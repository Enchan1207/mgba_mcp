/** mGBAクライアントのエラー */
export abstract class MgbaClientError extends Error {
  public abstract readonly code: string

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MgbaClientError'
  }
}
