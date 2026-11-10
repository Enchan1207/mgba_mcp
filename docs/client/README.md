# mGBA ビューアクライアント

macOS 13 以降向けの AppKit ビューアです。Unix domain socket で `mgba_server` に `VIEW` 接続し、公開画面と状態を表示します。

## ビルドと起動

```sh
cd mgba_client
swift build
swift run mgba_client
```

起動後、サーバのソケットパスと待機時間（10～120 秒）を入力します。ビューアを閉じると接続を切断し、入力済みのパスを保持してホストセレクタへ戻ります。

## テスト

```sh
swift test
```
