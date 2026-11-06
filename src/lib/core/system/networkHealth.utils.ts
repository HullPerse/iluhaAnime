import { createSignalStore } from "@hullperse/hp_utils/signal";

const store = createSignalStore();

/**
 * One failed request is usually a server hiccup, so two transport failures
 * inside half a minute are needed before the banner calls the network dead.
 */
const FAILURE_WINDOW_MS = 30_000;
const FAILURE_THRESHOLD = 2;

export const networkAtoms = {
  reachable: store.atom("network.reachable", true),
  checking: store.atom("network.checking", false),
};

let failures = 0;
let firstFailureAt = 0;

const CONNECTIVITY_ERROR =
  /error sending request|error trying to connect|dns error|network is unreachable|connection (refused|reset|aborted|closed)|operation timed out|timed out|proxy connect|proxy error|no route to host/iu;

export function isConnectivityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CONNECTIVITY_ERROR.test(message);
}

/** Any answered request proves the route works again. */
export function noteNetworkSuccess(): void {
  failures = 0;
  firstFailureAt = 0;
  if (!networkAtoms.reachable.get()) networkAtoms.reachable.set(true);
}

/**
 * A request that never reached a server is a hint, not a verdict. An HTTP
 * error is ignored on purpose: a 403 or a 500 proves the connection works.
 */
export function noteNetworkFailure(error: unknown): void {
  if (!isConnectivityError(error)) return;
  const now = Date.now();
  if (firstFailureAt === 0 || now - firstFailureAt > FAILURE_WINDOW_MS) {
    firstFailureAt = now;
    failures = 0;
  }
  failures += 1;
  if (failures >= FAILURE_THRESHOLD) networkAtoms.reachable.set(false);
}

/** Run the backend probe, updating the banner state with its answer. */
export async function probeNetwork(probe: () => Promise<boolean>): Promise<boolean> {
  if (networkAtoms.checking.get()) return networkAtoms.reachable.get();
  networkAtoms.checking.set(true);
  try {
    const reachable = await probe();
    if (reachable) noteNetworkSuccess();
    else networkAtoms.reachable.set(false);
    return reachable;
  } catch (error) {
    noteNetworkFailure(error);
    return false;
  } finally {
    networkAtoms.checking.set(false);
  }
}
