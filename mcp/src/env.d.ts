interface Env {
  MGBA_MCP_SOCKET_PATH: string
}

declare namespace NodeJS {
  interface ProcessEnv extends Env {}
}
