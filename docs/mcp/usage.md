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

MCPクライアントから起動する場合は、コマンドを`mgba_mcp/mcp/node_modules/.bin/tsx`の絶対パス、引数を`mgba_mcp/mcp/src/index.ts`の絶対パスに設定してください。標準入出力で通信します。

## 公開ツール

| ツール | 入力 | 動作 |
| --- | --- | --- |
| `press_button` | `button`、省略可能な`frames` | ボタンを押し、同じフレーム数だけ解放して進めます。`frames`の初期値は10です。 |
| `walk_for` | `direction`、`frames` | 指定方向に進み、方向キーを解放してから10フレーム進めます。 |
| `wait` | `frames` | 全ボタンを解放し、指定フレーム数だけ進めます。 |
| `get_screen` | なし | 現在の画面をPNG画像で返します。画面がない場合は1フレーム進めてから取得します。 |

`frames`は1～18000の整数です。操作ツールは今回進んだフレーム数と累積フレーム数を返します。`get_screen`は画像とフレーム数を返します。

## テスト・チェック

```sh
pnpm test
pnpm run build
pnpm run lint
pnpm fmt --check
```
