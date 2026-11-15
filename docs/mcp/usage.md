# `mgba_mcp` の使い方

TypeScript 製の MCP サーバです。

## 必要なもの

- Node.js 22.12 以降
- pnpm 11.8.0

特に指定のない限り、コマンドは`mgba_mcp/mcp`ディレクトリで実行します。

## ビルド

```sh
pnpm install --frozen-lockfile
pnpm run build
```

ビルドでは型宣言ファイルを`dist`に出力します。

## 実行

`MGBA_MCP_SOCKET_PATH`に、起動済みの`mgba_server`が使用するUnix domain socketのパスを指定します。未設定または空文字の場合、起動に失敗します。

```sh
MGBA_MCP_SOCKET_PATH=/private/tmp/mgba.sock pnpm start
```

MCPクライアントから起動する場合は、コマンドを`mgba_mcp/mcp/node_modules/.bin/tsx`の絶対パス、引数を`mgba_mcp/mcp/src/handler.ts`の絶対パスに設定してください。標準入出力で通信します。

## テスト・チェック

```sh
pnpm test
pnpm run build
pnpm run lint
pnpm fmt --check
```
