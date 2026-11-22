import type { GameStartInfo } from "@/types/core/game";
import type { GameSessionRuntime } from "@/types/core/gameSession";

/**
 * The game window owns at most one native emulator session. Every start gets a
 * token, and a completion is applied only while that token is still the one the
 * machine is waiting for. Stale completions never become the running session.
 */
type GameSessionPhase =
  | { phase: "idle" }
  | { phase: "starting"; token: number }
  | { phase: "running"; token: number; info: GameStartInfo }
  | { phase: "error"; token: number; message: string };

export interface GameSessionState {
  phase: GameSessionPhase;
  nextToken: number;
}

export function initialGameSessionState(): GameSessionState {
  return { phase: { phase: "idle" }, nextToken: 1 };
}

/** Revokes any in-flight start and marks this token as the only current one. */
export function beginGameStart(state: GameSessionState): {
  state: GameSessionState;
  token: number;
} {
  const token = state.nextToken;

  return {
    state: { phase: { phase: "starting", token }, nextToken: token + 1 },
    token,
  };
}

export function gameStartSucceeded(
  state: GameSessionState,
  token: number,
  info: GameStartInfo
): GameSessionState {
  const phase = state.phase;

  if (phase.phase !== "starting" || phase.token !== token) return state;

  return { ...state, phase: { phase: "running", token, info } };
}

export function gameStartFailed(
  state: GameSessionState,
  token: number,
  message: string
): GameSessionState {
  const phase = state.phase;

  if (phase.phase !== "starting" || phase.token !== token) return state;

  return { ...state, phase: { phase: "error", token, message } };
}

export function gameSessionCrashed(
  state: GameSessionState,
  token: number,
  message: string
): GameSessionState {
  const phase = state.phase;

  if (phase.phase !== "running" || phase.token !== token) return state;

  return { ...state, phase: { phase: "error", token, message } };
}

/** Invalidates every in-flight start, including one that has not resolved yet. */
export function stopGameSession(state: GameSessionState): GameSessionState {
  return { phase: { phase: "idle" }, nextToken: state.nextToken + 1 };
}

export function isGameStartCurrent(state: GameSessionState, token: number): boolean {
  return state.phase.phase === "starting" && state.phase.token === token;
}

const STATUS_BY_PHASE: Record<GameSessionPhase["phase"], GameSessionRuntime["status"]> = {
  idle: "idle",
  starting: "starting",
  running: "running",
  error: "error",
};

export function gameRuntimeOf(state: GameSessionState): GameSessionRuntime {
  const phase = state.phase;

  return {
    status: STATUS_BY_PHASE[phase.phase],
    info: phase.phase === "running" ? phase.info : null,
    error: phase.phase === "error" ? phase.message : null,
  };
}
