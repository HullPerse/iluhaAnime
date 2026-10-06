import { LOBBY_TICKET_PREFIX } from "@/config/lobby/common.config";
import type { SessionTicket } from "@/types/session";

const HEX = /^[0-9a-fA-F]+$/;
const ENDPOINT_HEX = /^[0-9a-fA-F]{64}$/;

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  if (remainder === 1) return null;
  const padded = remainder === 0 ? base64 : base64 + "=".repeat(4 - remainder);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.codePointAt(index) ?? 0;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function isHex(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    HEX.test(value)
  );
}

export function normalizeTicket(value: unknown): SessionTicket | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isHex(record.sessionId, 4, 64)) return null;
  if (!isHex(record.token, 4, 128)) return null;
  if (typeof record.endpointId !== "string" || !ENDPOINT_HEX.test(record.endpointId)) return null;
  return {
    sessionId: record.sessionId.toLowerCase(),
    token: record.token.toLowerCase(),
    endpointId: record.endpointId.toLowerCase(),
  };
}

export function formatTicketShare(ticket: SessionTicket): string {
  const payload = JSON.stringify({
    sessionId: ticket.sessionId,
    token: ticket.token,
    endpointId: ticket.endpointId,
  });
  return `${LOBBY_TICKET_PREFIX}${encodeBase64Url(payload)}`;
}

export function parseTicket(raw: string): SessionTicket | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const prefix = LOBBY_TICKET_PREFIX;
  let json: string | null;
  if (trimmed.toLowerCase().startsWith(prefix)) {
    json = decodeBase64Url(trimmed.slice(prefix.length));
  } else if (trimmed.startsWith("{")) {
    json = trimmed;
  } else {
    return null;
  }
  if (json === null) return null;
  try {
    return normalizeTicket(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

export function ticketRoomLabel(ticket: SessionTicket): string {
  const head = ticket.sessionId.slice(0, 8).toUpperCase();
  return `${head.slice(0, 4)} ${head.slice(4)}`;
}
