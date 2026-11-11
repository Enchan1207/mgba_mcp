# mGBAクライアント

macOS 13 以降向けの AppKit ビューアです。Unix domain socket で `mgba_server` に `VIEW` 接続し、公開画面と状態を表示します。

## 必要なもの

- macOS 13 以降
- Swift 5.9 以降
- 起動済みの `mgba_server`

## ビルド

```sh
cd mgba_client
swift build
```

## 起動

以下のコマンドでクライアントが起動します。

```sh
swift run mgba_client
```

サーバのソケットパスと待機時間(10～120 秒)を入力し「接続」をクリックします。

## テスト

```sh
swift test
```
