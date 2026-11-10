# サーバへの接続

## 起動

`mgba_server` ディレクトリでビルドした後、Game Boy の ROM と Unix domain socket のパスを指定して起動します。

```sh
./build/target/cli/mgba_server --rom /path/to/game.gb --socket /private/tmp/mgba.sock
```

サーバは同じホストのプロセスからの接続を待ちます。ソケットファイルは所有者だけが読み書きできます。指定したパスにファイルが既にある場合は起動せずに終了します。サーバの終了時にはソケットファイルを削除します。

## 接続と役割の宣言

クライアントは Unix domain socket に接続し、最初の要求として次のどちらかを改行付きで送ります。

- `HELLO CONTROL\n`: エミュレータを操作する接続。同時に一つだけ使用できます。占有中の接続要求は `CONTROL_BUSY` を返して切断されます。
- `HELLO VIEW\n`: 画面を閲覧する接続。複数のクライアントが使用できます。

役割宣言への応答を読み切ってからコマンドを送ります。一つの接続では要求を一つずつ送り、各応答を読み切ってから次の要求を送ってください。`CONTROL` が切断されてもセッションは残り、別の `CONTROL` が接続できます。

以下は Python で接続して `STATUS` を取得する例です。ソケットパスは起動時に指定したものに合わせて変更してください。

```python
import socket


def read_exact(conn, size):
    data = bytearray()
    while len(data) < size:
        part = conn.recv(size - len(data))
        if not part:
            raise EOFError("server disconnected")
        data.extend(part)
    return bytes(data)


def request(conn, command):
    conn.sendall((command + "\n").encode("ascii"))
    header = read_exact(conn, 5)
    length = int.from_bytes(header[1:5], "little")
    if header[:1] not in (b"S", b"E") or length > 1024 * 1024:
        raise ValueError("invalid response header")
    body = read_exact(conn, length)
    if read_exact(conn, 1) != b"\n":
        raise ValueError("invalid response terminator")
    return header[:1], body


with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
    conn.connect("/private/tmp/mgba.sock")
    print(request(conn, "HELLO VIEW"))
    print(request(conn, "STATUS"))
```

要求・応答の詳細、各コマンドの権限とエラーは [コマンドリファレンス](command_references.md) を参照してください。
