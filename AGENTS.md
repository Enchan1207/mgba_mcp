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
