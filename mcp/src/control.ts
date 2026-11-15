import { createConnection, type Socket } from "node:net";

const MAX_BODY_LENGTH = 1024 * 1024;
const MAX_SAFE_FRAMES = BigInt(Number.MAX_SAFE_INTEGER);

export class ControlConnection {
  private socket: Socket | undefined;
  private reader: AsyncIterator<Buffer> | undefined;
  private remaining = Buffer.alloc(0);
  private connecting: Promise<void> | undefined;

  constructor(private readonly socketPath: string) {}

  async command(command: string): Promise<Buffer> {
    await this.connect();
    try {
      return await this.exchange(command);
    } catch (error) {
      if (!(error instanceof ServerCommandError)) this.close();
      throw error;
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = undefined;
    this.reader = undefined;
    this.remaining = Buffer.alloc(0);
  }

  private async connect(): Promise<void> {
    if (this.socket) return;
    if (!this.connecting) {
      this.connecting = this.open();
    }
    try {
      await this.connecting;
    } finally {
      this.connecting = undefined;
    }
  }

  private async open(): Promise<void> {
    const socket = createConnection(this.socketPath);
    try {
      await new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          socket.off("error", onError);
          resolve();
        };
        const onError = (error: Error) => {
          socket.off("connect", onConnect);
          reject(error);
        };
        socket.once("connect", onConnect);
        socket.once("error", onError);
      });
      this.socket = socket;
      socket.on("error", () => {
        if (this.socket === socket) this.close();
      });
      socket.on("close", () => {
        if (this.socket === socket) this.close();
      });
      this.reader = socket[Symbol.asyncIterator]();
      await this.exchange("HELLO CONTROL");
    } catch (error) {
      this.close();
      socket.destroy();
      throw error;
    }
  }

  private async exchange(command: string): Promise<Buffer> {
    const socket = this.socket;
    if (!socket) throw new Error("CONTROL connection is unavailable");
    await new Promise<void>((resolve, reject) => {
      socket.write(`${command}\n`, (error?: Error | null) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const header = await this.readExact(5);
    const length = header.readUInt32LE(1);
    if ((header[0] !== 0x53 && header[0] !== 0x45) || length > MAX_BODY_LENGTH) {
      throw new Error("Invalid server response header");
    }
    const body = await this.readExact(length);
    if ((await this.readExact(1))[0] !== 0x0a) {
      throw new Error("Invalid server response terminator");
    }
    if (header[0] === 0x45) throw new ServerCommandError(command, body.toString("ascii"));
    return body;
  }

  private async readExact(length: number): Promise<Buffer> {
    while (this.remaining.length < length) {
      const next = await this.reader?.next();
      if (!next || next.done) throw new Error("Server disconnected");
      this.remaining = Buffer.concat([this.remaining, next.value]);
    }
    const result = this.remaining.subarray(0, length);
    this.remaining = this.remaining.subarray(length);
    return result;
  }
}

export class ServerCommandError extends Error {
  constructor(command: string, code: string) {
    super(`${command} failed: ${code}`);
  }
}

export function parseTotalFrames(body: Buffer): number {
  const match = /^frames=(\d+) pressed_keys=(\d+) has_frame=(true|false)$/.exec(
    body.toString("ascii"),
  );
  if (!match) throw new Error("Invalid STATUS response");
  if (BigInt(match[2]!) !== 0n) throw new Error("STATUS reports pressed buttons");
  const total = BigInt(match[1]!);
  if (total > MAX_SAFE_FRAMES) throw new Error("STATUS frames exceeds safe integer range");
  return Number(total);
}
