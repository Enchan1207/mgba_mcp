import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const entrypoint = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("press_button", () => {
  let directory: string | undefined;
  let socketServer: Server | undefined;
  let child: ChildProcessWithoutNullStreams | undefined;
  const sockets = new Set<Socket>();
  const commands: string[] = [];
  let invalidButton: unknown;
  let invalidZeroFrames: unknown;
  let invalidExcessFrames: unknown;
  let invalidFractionFrames: unknown;
  let commandsAfterValidation: string[];
  let successfulCall: unknown;
  let commandsAfterSuccess: string[];
  let failedCall: unknown;
  let commandsAfterFailure: string[];

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "mgba-mcp-"));
    const socketPath = join(directory, "control.sock");
    socketServer = createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      let input = "";
      socket.setEncoding("ascii");
      socket.on("data", (chunk: string) => {
        input += chunk;
        for (;;) {
          const newline = input.indexOf("\n");
          if (newline < 0) break;
          const command = input.slice(0, newline);
          input = input.slice(newline + 1);
          commands.push(command);
          const body = Buffer.from(
            command === "STATUS"
              ? "frames=20 pressed_keys=0 has_frame=true"
              : command === "TYPE B 5"
                ? "BAD_REQUEST"
                : "",
            "ascii",
          );
          const header = Buffer.alloc(5);
          header[0] = command === "TYPE B 5" ? 0x45 : 0x53;
          header.writeUInt32LE(body.length, 1);
          socket.write(Buffer.concat([header, body, Buffer.from("\n")]));
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      socketServer!.once("error", reject);
      socketServer!.listen(socketPath, () => {
        socketServer!.off("error", reject);
        resolve();
      });
    });

    child = spawn(process.execPath, [entrypoint], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, MGBA_MCP_SOCKET_PATH: socketPath },
    });
    let output = "";
    const pending = new Map<number, (value: unknown) => void>();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      for (;;) {
        const newline = output.indexOf("\n");
        if (newline < 0) break;
        const message = JSON.parse(output.slice(0, newline)) as { id?: number };
        output = output.slice(newline + 1);
        if (message.id !== undefined) pending.get(message.id)?.(message);
      }
    });
    const request = (id: number, method: string, params: unknown): Promise<unknown> => {
      const result = new Promise<unknown>((resolve) => pending.set(id, resolve));
      child!.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return result;
    };

    await request(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    );

    invalidButton = await request(2, "tools/call", {
      name: "press_button",
      arguments: { button: "X" },
    });
    invalidZeroFrames = await request(3, "tools/call", {
      name: "press_button",
      arguments: { button: "A", frames: 0 },
    });
    invalidExcessFrames = await request(4, "tools/call", {
      name: "press_button",
      arguments: { button: "A", frames: 18001 },
    });
    invalidFractionFrames = await request(5, "tools/call", {
      name: "press_button",
      arguments: { button: "A", frames: 1.5 },
    });
    commandsAfterValidation = [...commands];

    successfulCall = await request(6, "tools/call", {
      name: "press_button",
      arguments: { button: "A" },
    });
    commandsAfterSuccess = [...commands];

    failedCall = await request(7, "tools/call", {
      name: "press_button",
      arguments: { button: "B", frames: 5 },
    });
    commandsAfterFailure = [...commands];
  }, 10000);

  afterAll(async () => {
    child?.kill();
    for (const socket of sockets) socket.destroy();
    if (socketServer?.listening) {
      await new Promise<void>((resolve) => socketServer!.close(() => resolve()));
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  describe("入力が不正な場合", () => {
    test("未対応のボタンを拒否する", () => {
      expect(invalidButton).toMatchObject({ result: { isError: true } });
    });

    test("フレーム数 0 を拒否する", () => {
      expect(invalidZeroFrames).toMatchObject({ result: { isError: true } });
    });

    test("上限を超えるフレーム数を拒否する", () => {
      expect(invalidExcessFrames).toMatchObject({ result: { isError: true } });
    });

    test("小数のフレーム数を拒否する", () => {
      expect(invalidFractionFrames).toMatchObject({ result: { isError: true } });
    });

    test("CONTROL コマンドを送らない", () => {
      expect(commandsAfterValidation).toEqual([]);
    });
  });

  describe("正常系", () => {
    test("進行フレーム数を返す", () => {
      expect(successfulCall).toMatchObject({
        result: { structuredContent: { framesAdvanced: 20, totalFrames: 20 } },
      });
    });

    test("ボタンを押して解放する", () => {
      expect(commandsAfterSuccess).toEqual(["HELLO CONTROL", "RELEASE ALL", "TYPE A 10", "STATUS"]);
    });
  });

  describe("CONTROL コマンドが失敗した場合", () => {
    test("エラーを返す", () => {
      expect(failedCall).toMatchObject({ result: { isError: true } });
    });

    test("ボタンを解放する", () => {
      expect(commandsAfterFailure.slice(4)).toEqual(["RELEASE ALL", "TYPE B 5", "RELEASE ALL"]);
    });
  });
});
