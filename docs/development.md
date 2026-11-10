# 開発ドキュメント

## Requirements

- CMake
- C/C++コンパイラ

## MCP server

Node.js 22.12以降と pnpm 11.8.0 が必要です。`mgba_mcp` ディレクトリで実行します。依存パッケージは公開から24時間以上経過したバージョンに制限されます。

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run lint
pnpm run format:check
```

起動するには `pnpm start` を実行します。MCPクライアントから接続する場合は、コマンドを `node`、引数を `mgba_mcp/dist/index.js` に設定してください。標準入出力で通信します。

現時点ではMCPサーバの接続基盤のみで、mGBAの操作ツールは未登録です。

## mGBA server

ディレクトリ `mgba_server` 以下で実行します。

### Bootstrap

```sh
cmake --preset target
```

### Build

```sh
cmake --build --preset target
```

### Test

GoogleTestを有効にしてビルドし、CTestで実行します。`mgba_server` ディレクトリで実行してください。

```sh
cmake --preset target -Dmgba_server_BUILD_TESTS=ON
cmake --build --preset target
ctest --test-dir build/target --output-on-failure
```
