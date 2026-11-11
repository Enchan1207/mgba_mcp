# mGBAサーバ

Game Boy の ROM を実行し、Unix domain socket を通じて操作・状態確認・画面取得を提供します。

## 必要なもの

- CMake 3.28 以降
- Ninja
- C/C++ コンパイラ
- ビルド時に mGBA のソースを取得できる環境
- 起動時に指定する Game Boy の ROM

特に指定のない限り、コマンドは `mgba_server` ディレクトリで実行します。

## ビルド

```sh
cd mgba_server
cmake --preset target
cmake --build --preset target
```

## 起動

以下のコマンドでサーバが起動します。

```sh
./build/target/cli/mgba_server --rom /path/to/game.gb --socket /private/tmp/mgba.sock
```

正常終了時はソケットファイルを削除します(指定したパスにファイルが既にある場合は起動せずに終了します)。

クライアントの接続手順は [接続方法](connection.md)、要求と応答の形式は [コマンド仕様](command_references.md) をそれぞれ参照してください。

## テスト

GoogleTestを有効にしてビルドしておく必要があります。

```sh
cmake --preset target -Dmgba_server_BUILD_TESTS=ON
cmake --build --preset target
```

CTestで実行します:

```sh
ctest --test-dir build/target --output-on-failure
```
