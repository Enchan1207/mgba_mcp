# AIエージェントにmGBAを操作させる

## Overview

mGBAのソケットサーバとMCPサーバを構成し、AIエージェントがゲームをプレイできるようにする

## ディレクトリ構成

- `mgba_server/`: mGBAを使うソケットサーバのCMakeプロジェクト
- `mgba_client/`: macOS向けエミュレータビューア
- `mgba_mcp/`: TypeScript製MCPサーバ
- `frame_converter/`: RGBXフレームをPNGに変換する補助ツール

## ドキュメント

- [ドキュメント一覧](docs/README.md)
- [`mgba_server` の使い方](docs/mgba_server/usage.md)・[接続方法](docs/mgba_server/connection.md)・[コマンド仕様](docs/mgba_server/command_references.md)
- [`mgba_client` の使い方](docs/mgba_client/usage.md)
- [`mgba_mcp` の使い方](docs/mgba_mcp/usage.md)
- [`frame_converter` の使い方](frame_converter/README.md)

## License

This repository is published under [MIT License](LICENSE).

mGBAのライセンスはこの限りではありません。
