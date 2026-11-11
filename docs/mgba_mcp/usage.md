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

```sh
pnpm start
```

MCPクライアントから起動する場合は、コマンドを `node`、引数をビルド後の `mgba_mcp/dist/index.js` の絶対パスに設定してください。標準入出力で通信します。

## テスト・チェック

```sh
pnpm test
pnpm run lint
pnpm run format:check
```
