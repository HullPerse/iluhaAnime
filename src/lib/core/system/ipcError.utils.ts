import { attemptSync } from "@hullperse/hp_utils/attempt";

export interface IpcErrorEnvelope {
  code: string;
  message: string;
}

export class IpcError extends Error {
  readonly code: string | null;

  constructor(code: string | null, message: string) {
    super(message);
    this.name = "IpcError";
    this.code = code;
  }
}

function isEnvelope(value: unknown): value is IpcErrorEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" && typeof record.message === "string";
}

function parseEnvelopeString(value: string): IpcErrorEnvelope | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  const [parsed] = attemptSync((): unknown => JSON.parse(trimmed));
  return isEnvelope(parsed) ? parsed : null;
}

export function normalizeIpcError(error: unknown): IpcError {
  if (error instanceof IpcError) return error;
  if (isEnvelope(error)) return new IpcError(error.code, error.message);
  if (typeof error === "string") {
    const envelope = parseEnvelopeString(error);
    return envelope ? new IpcError(envelope.code, envelope.message) : new IpcError(null, error);
  }
  if (error instanceof Error) return new IpcError(null, error.message);
  return new IpcError(null, String(error));
}

export function ipcErrorCode(error: unknown): string | null {
  if (error instanceof IpcError) return error.code;
  if (typeof error === "object" && error !== null) {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "string") return code;
  }
  return typeof error === "string" ? (parseEnvelopeString(error)?.code ?? null) : null;
}
