export interface DatabaseStatus {
  ok: boolean;
  version: number | null;
  dataDir: string;
  error: string | null;
}

export type DbGateState = "idle" | "checking" | "ok" | "failed";
