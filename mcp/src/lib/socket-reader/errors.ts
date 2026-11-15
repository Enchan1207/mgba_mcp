export abstract class SocketReaderError extends Error {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SocketReaderError'
  }
}

/** サーバから切断された */
export class ServerDisconnectedError extends SocketReaderError {
  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ServerDisconnectedError'
  }
}
