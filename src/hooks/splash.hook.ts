import { useCallback, useEffect, useRef, useState } from "react";

import { systemApi } from "@/api/system.api";
import { scheduleTask, sleep, type ScheduledTask, type SleepTask } from "@/lib/pacer/shared.utils";
import { detectMigrations } from "@/lib/splash/migrations.utils";
import {
  awaitCacheReady,
  awaitSignal,
  isIndexReady,
  isSpellingReady,
  onIndexReady,
  onSpellingReady,
} from "@/lib/splash/signals.utils";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import { applyTheme, themeAtoms } from "@/store/theme.store";
import type { DatabaseStatus } from "@/types/db";

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

const DEFAULT_MIN_MS = 600;
const DEFAULT_STAGE_TIMEOUT_MS = 8000;
const DEFAULT_STEP_MS = 300;

const INITIAL_STAGES: SplashStage[] = [
  { id: "theme", status: "pending" },
  { id: "migrations", status: "pending" },
  { id: "cache", status: "pending" },
  { id: "database", status: "pending" },
  { id: "tabs", status: "pending" },
  { id: "spelling", status: "pending" },
  { id: "index", status: "pending" },
];

type GatingKey = "theme" | "migrations" | "cache" | "database" | "tabs" | "spelling" | "index";

function withStatus(
  stages: SplashStage[],
  id: SplashStageId,
  status: SplashStageStatus
): SplashStage[] {
  return stages.map((stage) => (stage.id === id ? { ...stage, status } : stage));
}

async function defaultCheckDatabase(): Promise<DbCheckResult> {
  const [data, failure] = await attempt(systemApi.getDatabaseStatus());
  if (failure !== null) return { ok: false, message: failure.message, status: null };
  if (!data.ok) return { ok: false, message: data.error ?? "Database check failed", status: data };
  return { ok: true, message: "", status: data };
}

export function useSplashStages(
  tabsReady: boolean,
  options: SplashOptions = {}
): {
  stages: SplashStage[];
  done: boolean;
  dbFailed: boolean;
  dbError: string | null;
  dbStatus: DatabaseStatus | null;
  retryDatabase: () => void;
} {
  const minMs = options.minMs ?? DEFAULT_MIN_MS;
  const stageTimeoutMs = options.stageTimeoutMs ?? DEFAULT_STAGE_TIMEOUT_MS;
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
  const checkDatabase = options.checkDatabase ?? defaultCheckDatabase;
  const [stages, setStages] = useState<SplashStage[]>(INITIAL_STAGES);
  const [done, setDone] = useState(false);
  const [dbFailed, setDbFailed] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [dbNonce, setDbNonce] = useState(0);
  const startedAt = useRef(0);
  const settled = useRef<Record<GatingKey, boolean>>({
    theme: false,
    migrations: false,
    cache: false,
    database: false,
    tabs: false,
    spelling: false,
    index: false,
  });
  const finished = useRef(false);
  const timers = useRef<ScheduledTask[]>([]);
  const naps = useRef<SleepTask[]>([]);
  const checkRef = useRef(checkDatabase);

  useEffect(() => {
    checkRef.current = checkDatabase;
  });

  const retryDatabase = useCallback(() => {
    setDbFailed(false);
    setDbError(null);
    setStages((current) => withStatus(current, "database", "active"));
    setDbNonce((value) => value + 1);
  }, []);

  const tryFinish = useCallback(() => {
    if (finished.current) return;
    const state = settled.current;
    if (
      !state.theme ||
      !state.migrations ||
      !state.cache ||
      !state.database ||
      !state.tabs ||
      !state.spelling ||
      !state.index
    ) {
      return;
    }
    finished.current = true;
    const wait = Math.max(0, minMs - (Date.now() - startedAt.current));
    const timer = scheduleTask("timeout", wait, () => setDone(true));
    timers.current.push(timer);
  }, [minMs]);

  useEffect(() => {
    startedAt.current = Date.now();
    let disposed = false;

    const pace = async (id: GatingKey, status: "done" | "degraded"): Promise<boolean> => {
      if (disposed) return false;
      settled.current[id] = true;
      setStages((current) => withStatus(current, id, status));
      const nap = sleep(stepMs);
      naps.current.push(nap);
      await nap.done;
      return !disposed;
    };

    const run = async (): Promise<void> => {
      setStages((current) => withStatus(current, "theme", "active"));
      try {
        applyTheme(themeAtoms.currentTheme.get(), themeAtoms.customThemes.get());
      } catch (error) {
        reportBackgroundError("splash.theme", error);
      }
      if (!(await pace("theme", "done"))) return;

      setStages((current) => withStatus(current, "migrations", "active"));
      try {
        detectMigrations();
      } catch (error) {
        reportBackgroundError("splash.migrations", error);
      }
      if (!(await pace("migrations", "done"))) return;

      setStages((current) => withStatus(current, "cache", "active"));
      const ready = await awaitCacheReady(stageTimeoutMs);
      if (disposed) return;
      if (!ready)
        reportBackgroundError("splash.cache.timeout", new Error("cache warmup timed out"));
      if (!(await pace("cache", ready ? "done" : "degraded"))) return;

      setStages((current) => withStatus(current, "spelling", "active"));
      const spelled = await awaitSignal(isSpellingReady, onSpellingReady, stageTimeoutMs);
      if (disposed) return;
      if (!spelled)
        reportBackgroundError("splash.spelling.timeout", new Error("spelling warmup timed out"));
      if (!(await pace("spelling", spelled ? "done" : "degraded"))) return;

      setStages((current) => withStatus(current, "index", "active"));
      const indexed = await awaitSignal(isIndexReady, onIndexReady, stageTimeoutMs);
      if (disposed) return;
      if (!indexed)
        reportBackgroundError("splash.index.timeout", new Error("anime index warmup timed out"));
      if (!(await pace("index", indexed ? "done" : "degraded"))) return;
      tryFinish();
    };

    run().catch((error) => reportBackgroundError("splash.boot", error));
    return () => {
      disposed = true;
      for (const nap of naps.current) nap.cancel();
      naps.current = [];
      for (const timer of timers.current) timer.cancel();
      timers.current = [];
    };
  }, [stepMs, stageTimeoutMs, tryFinish]);

  useEffect(() => {
    let disposed = false;
    setStages((current) => withStatus(current, "database", "active"));
    checkRef
      .current()
      .then(async (result) => {
        if (disposed) return;
        if (result.ok) {
          setDbStatus(result.status);
          const nap = sleep(stepMs);
          naps.current.push(nap);
          await nap.done;
          if (disposed) return;
          settled.current.database = true;
          setStages((current) => withStatus(current, "database", "done"));
          tryFinish();
        } else {
          setDbError(result.message);
          setDbStatus(result.status);
          setStages((current) => withStatus(current, "database", "degraded"));
          setDbFailed(true);
        }
      })
      .catch((error) => {
        if (disposed) return;
        reportBackgroundError("splash.database", error);
        setDbError(error instanceof Error ? error.message : String(error));
        setStages((current) => withStatus(current, "database", "degraded"));
        setDbFailed(true);
      });
    return () => {
      disposed = true;
    };
  }, [dbNonce, stepMs, tryFinish]);

  useEffect(() => {
    if (!tabsReady || finished.current) return;
    settled.current.tabs = true;
    setStages((current) => withStatus(current, "tabs", "done"));
    tryFinish();
  }, [tabsReady, tryFinish]);

  return { stages, done, dbFailed, dbError, dbStatus, retryDatabase };
}
