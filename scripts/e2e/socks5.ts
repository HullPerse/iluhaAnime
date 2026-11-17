// Minimal SOCKS5 CONNECT proxy for live diagnostics.
//
// It accepts a no-auth greeting, opens the requested TCP target, and relays
// bytes. Domain targets are resolved by this proxy, which lets the e2e test
// prove that the app used remote DNS (socks5h) instead of resolving locally.

import { lookup } from "node:dns";
import { createServer, connect, type Socket } from "node:net";

const VERSION = 5;
const CMD_CONNECT = 1;
const ATYP_IPV4 = 1;
const ATYP_DOMAIN = 3;
const ATYP_IPV6 = 4;

export interface Socks5Request {
  host: string;
  port: number;
  atyp: number;
}

export interface Socks5Proxy {
  url: string;
  requests: Socks5Request[];
  errors: string[];
  close: () => Promise<void>;
}

interface ParsedRequest {
  host: string;
  port: number;
  atyp: number;
  used: number;
}

function ipv6FromBuffer(buffer: Buffer): string {
  const groups: string[] = [];
  for (let offset = 0; offset < 16; offset += 2) {
    groups.push(buffer.readUInt16BE(offset).toString(16));
  }
  return groups.join(":");
}

function parseRequest(buffer: Buffer): ParsedRequest | null | "invalid" {
  if (buffer.length < 4) return null;
  if (buffer[0] !== VERSION || buffer[1] !== CMD_CONNECT || buffer[2] !== 0) {
    return "invalid";
  }

  const atyp = buffer.readUInt8(3);
  if (atyp === ATYP_IPV4) {
    if (buffer.length < 10) return null;
    return {
      host: `${buffer[4]}.${buffer[5]}.${buffer[6]}.${buffer[7]}`,
      port: buffer.readUInt16BE(8),
      atyp,
      used: 10,
    };
  }
  if (atyp === ATYP_DOMAIN) {
    if (buffer.length < 5) return null;
    const length = buffer.readUInt8(4);
    if (buffer.length < 5 + length + 2) return null;
    return {
      host: buffer.subarray(5, 5 + length).toString("utf-8"),
      port: buffer.readUInt16BE(5 + length),
      atyp,
      used: 5 + length + 2,
    };
  }
  if (atyp === ATYP_IPV6) {
    if (buffer.length < 22) return null;
    return {
      host: ipv6FromBuffer(buffer.subarray(4, 20)),
      port: buffer.readUInt16BE(20),
      atyp,
      used: 22,
    };
  }
  return "invalid";
}

function successReply(): Buffer {
  return Buffer.from([VERSION, 0, 0, ATYP_IPV4, 0, 0, 0, 0, 0, 0]);
}

function failureReply(): Buffer {
  return Buffer.from([VERSION, 1, 0, ATYP_IPV4, 0, 0, 0, 0, 0, 0]);
}

function connectUpstream(
  request: ParsedRequest,
  onReady: (socket: Socket) => void,
  onError: (message: string) => void
): void {
  const open = (host: string): void => {
    const upstream = connect({ host, port: request.port });
    const onSocketError = (error: Error): void => {
      upstream.destroy();
      onError(error.message);
    };
    upstream.once("error", onSocketError);
    upstream.once("connect", () => {
      upstream.off("error", onSocketError);
      onReady(upstream);
    });
  };

  if (request.atyp === ATYP_IPV4 || request.atyp === ATYP_IPV6) {
    open(request.host);
    return;
  }

  lookup(request.host, { family: 4 }, (error, address) => {
    if (error) {
      onError(error.message);
      return;
    }
    open(address);
  });
}

function isConnectionReset(error: Error): boolean {
  return (error as NodeJS.ErrnoException).code === "ECONNRESET";
}

export async function startSocks5Proxy(): Promise<Socks5Proxy> {
  const requests: Socks5Request[] = [];
  const errors: string[] = [];
  const sockets = new Set<Socket>();

  const server = createServer((client) => {
    sockets.add(client);
    client.once("close", () => sockets.delete(client));
    client.on("error", (error) => {
      if (!isConnectionReset(error)) errors.push(`client: ${error.message}`);
    });

    let phase: "greeting" | "request" | "connecting" | "relay" | "closed" = "greeting";
    let buffer = Buffer.alloc(0);
    let upstream: Socket | null = null;
    let replied = false;

    const fail = (message: string): void => {
      if (phase === "closed") return;
      errors.push(message);
      if (!replied && !client.destroyed) client.write(failureReply());
      replied = true;
      phase = "closed";
      client.end();
      upstream?.destroy();
    };

    const onData = (chunk: Buffer): void => {
      if (phase === "relay" || phase === "closed") return;
      buffer = Buffer.concat([buffer, chunk]);

      if (phase === "greeting") {
        if (buffer.length < 2) return;
        const methodCount = buffer.readUInt8(1);
        if (buffer.length < 2 + methodCount) return;
        const methods = buffer.subarray(2, 2 + methodCount);
        if (!methods.includes(0)) {
          fail("client requires authentication");
          return;
        }
        client.write(Buffer.from([VERSION, 0]));
        buffer = buffer.subarray(2 + methodCount);
        phase = "request";
      }

      if (phase !== "request") return;
      const parsed = parseRequest(buffer);
      if (parsed === "invalid") {
        fail("invalid CONNECT request");
        return;
      }
      if (parsed === null) return;

      requests.push({ host: parsed.host, port: parsed.port, atyp: parsed.atyp });
      buffer = buffer.subarray(parsed.used);
      phase = "connecting";
      client.removeListener("data", onData);

      connectUpstream(
        parsed,
        (socket) => {
          upstream = socket;
          replied = true;
          phase = "relay";
          client.write(successReply());
          if (buffer.length > 0) socket.write(buffer);
          client.pipe(socket);
          socket.pipe(client);
          socket.on("error", (error) => {
            if (!isConnectionReset(error)) {
              errors.push(`upstream ${parsed.host}:${parsed.port}: ${error.message}`);
            }
            client.destroy();
          });
          client.once("close", () => socket.destroy());
          socket.once("close", () => client.destroy());
        },
        (message) => {
          fail(`connect ${parsed.host}:${parsed.port}: ${message}`);
        }
      );
    };

    client.on("data", onData);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("SOCKS5 proxy did not expose a TCP port");
  }

  const close = async (): Promise<void> => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    url: `socks5://127.0.0.1:${address.port}`,
    requests,
    errors,
    close,
  };
}
