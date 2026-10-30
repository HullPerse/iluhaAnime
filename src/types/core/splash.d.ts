import type { DatabaseStatus } from "@/types/core/db";

export type SplashStageId =
  | "theme"
  | "migrations"
  | "cache"
  | "database"
  | "tabs"
  | "spelling"
  | "index";

export type SplashStageStatus = "pending" | "active" | "done" | "degraded";

export interface SplashStage {
  id: SplashStageId;
  status: SplashStageStatus;
}

export interface DbCheckResult {
  ok: boolean;
  message: string;
  status: DatabaseStatus | null;
}

export interface SplashOptions {
  minMs?: number;
  stageTimeoutMs?: number;
  stepMs?: number;
  checkDatabase?: () => Promise<DbCheckResult>;
}
