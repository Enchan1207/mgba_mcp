# 開発ドキュメント

## Requirements

- CMake
- C/C++コンパイラ

## MCP server

under construction

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
