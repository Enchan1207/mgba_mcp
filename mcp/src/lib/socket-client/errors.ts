/** ソケットクライアントで発生した例外 */
export abstract class SocketClientError extends Error {
  public abstract readonly code: string

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SocketClientError'
  }
}

/** 接続に失敗した */
export class SocketConnectionFailedError extends SocketClientError {
  public readonly code = 'socket_client.connection_failed'

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SocketConnectionFailedError'
  }
}

/** 接続が切断された */
export class SocketDisconnectedError extends SocketClientError {
  public readonly code = 'socket_client.disconnected'

  public constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'SocketDisconnectedError'
  }
}
