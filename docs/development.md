# 開発ドキュメント

## Requirements

- CMake
- C/C++コンパイラ

## MCP server

under construction

## mGBA server

ディレクトリ `mgba_server` 以下で実行します。

### Boostrap

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

### 常駐サーバの起動

```sh
./build/target/src/mgba_server --rom /path/to/game.gb --socket /private/tmp/mgba.sock
```

同じホストのクライアントが Unix domain socket に接続し、最初に `HELLO CONTROL\n` または `HELLO VIEW\n` を送ります。`CONTROL` は一接続、`VIEW` は複数接続できます。要求は 32 バイト以内の改行終端行です。応答は `S` または `E` の 1 バイト、本文長のリトルエンディアン `uint32_t`、本文、改行 1 バイトの順です。画像本文はフレーム数のリトルエンディアン `uint64_t`、幅・高さ各 1 バイト、RGBX8888 画素列です。詳細は [セッションサーバ設計](design/feature/261110_%231_セッションサーバ設計.md) を参照してください。
