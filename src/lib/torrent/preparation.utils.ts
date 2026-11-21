import type {
  PreparationPhase,
  PreparationSource,
  PreparationState,
} from "@/types/torrent/preparation";
import type { PickerTorrent } from "@/types/torrent/torrent";

export function initialPreparationState(): PreparationState {
  return { phase: { phase: "idle" }, queue: [], nextToken: 1 };
}

export function preparationPending(state: PreparationState): PickerTorrent | null {
  const phase = state.phase;
  return phase.phase === "pending" || phase.phase === "confirming" ? phase.pending : null;
}

export function enqueuePreparation(
  state: PreparationState,
  filePaths: string[]
): PreparationState {
  if (filePaths.length === 0) return state;
  return {
    ...state,
    queue: [...state.queue, ...filePaths.map((value) => ({ kind: "file" as const, value }))],
  };
}

function issued(state: PreparationState): { state: PreparationState; token: number } {
  const token = state.nextToken;
  return {
    state: { ...state, phase: { phase: "preparing", token }, nextToken: token + 1 },
    token,
  };
}

/** Takes the next queued source, but only while the machine can accept work. */
export function beginNextPreparation(
  state: PreparationState
): { state: PreparationState; token: number; source: PreparationSource } | null {
  if (state.phase.phase !== "idle" || state.queue.length === 0) return null;
  const [source, ...queue] = state.queue;
  const next = issued({ ...state, queue });
  return { ...next, source };
}

export function beginDirectPreparation(
  state: PreparationState
): { state: PreparationState; token: number } | null {
  if (state.phase.phase !== "idle") return null;
  return issued(state);
}

export function isPreparing(state: PreparationState, token: number): boolean {
  return state.phase.phase === "preparing" && state.phase.token === token;
}

export function isConfirming(state: PreparationState, token: number): boolean {
  return state.phase.phase === "confirming" && state.phase.token === token;
}

export function preparationSucceeded(
  state: PreparationState,
  token: number,
  pending: PickerTorrent
): PreparationState {
  if (!isPreparing(state, token)) return state;
  return { ...state, phase: { phase: "pending", token, pending } };
}

export function preparationFailed(
  state: PreparationState,
  token: number
): PreparationState {
  if (!isPreparing(state, token)) return state;
  return { ...state, phase: { phase: "idle" } };
}

/** Revokes the current attempt and returns the picker that was on screen. */
export function cancelPreparation(state: PreparationState): {
  state: PreparationState;
  pending: PickerTorrent | null;
} {
  const phase: PreparationPhase = state.phase;
  if (phase.phase === "idle") return { state, pending: null };
  return {
    state: { ...state, phase: { phase: "idle" }, nextToken: state.nextToken + 1 },
    pending: preparationPending(state),
  };
}

export function beginConfirmation(
  state: PreparationState
): { state: PreparationState; token: number; pending: PickerTorrent } | null {
  const phase = state.phase;
  if (phase.phase !== "pending") return null;
  return {
    state: { ...state, phase: { phase: "confirming", token: phase.token, pending: phase.pending } },
    token: phase.token,
    pending: phase.pending,
  };
}

/**
 * A successful confirmation clears the picker; a failure returns to `pending`
 * so the user can retry without re-fetching metadata.
 */
export function confirmationSettled(
  state: PreparationState,
  token: number,
  succeeded: boolean
): PreparationState {
  const phase = state.phase;
  if (phase.phase !== "confirming" || phase.token !== token) return state;
  if (!succeeded) {
    return { ...state, phase: { phase: "pending", token, pending: phase.pending } };
  }
  return { ...state, phase: { phase: "idle" } };
}
