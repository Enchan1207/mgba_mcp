# AGENTS.md

## composition

- `mgba_server`: mGBAを組み込んだソケットサーバ
- `mgba_mcp`: mgba_serverとの通信を仲介するMCPサーバ

### mgba_server

- CMakeプロジェクトが構成されています。
- GoogleTestによるテストが構成されています。

### mgba_mcp

- 現在構成されていません。

## rules

- CMakeプロジェクトについては、実装タスク完了後に単体テストを走らせてください。
- ディレクトリ docs/design は、特定の大きな機能の実装にあたってその設計を詰める時に使います。
  - 実装を完了したら、先頭セクション直下に `実装済: #<issue>` を記載します。
  - これが記載されているファイルは、その後に設計変更があっても更新する必要はありません。
