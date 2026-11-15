# `mgba_mcp` の使い方

TypeScript 製の MCP サーバです。

## 必要なもの

- Node.js 22.12 以降
- pnpm 11.8.0

特に指定のない限り、コマンドは `mgba_mcp` ディレクトリで実行します。

## ビルド

```sh
pnpm install --frozen-lockfile
pnpm run build
```

## 実行

`MGBA_MCP_SOCKET_PATH`に、起動済みの`mgba_server`が使用するUnix domain socketのパスを指定します。未設定または空文字の場合、起動に失敗します。

```sh
MGBA_MCP_SOCKET_PATH=/private/tmp/mgba.sock pnpm start
```

MCPクライアントから起動する場合は、コマンドを `node`、引数をビルド後の `mgba_mcp/dist/index.js` の絶対パスに設定してください。標準入出力で通信します。

## テスト・チェック

```sh
pnpm test
pnpm run lint
pnpm run format:check
```
