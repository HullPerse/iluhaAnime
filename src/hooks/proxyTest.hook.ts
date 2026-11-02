import { useCallback, useEffect, useRef, useState } from "react";

import { createInterval } from "@/lib/core/interval.utils";
import { attemptResult } from "@/lib/core/result.utils";

export const PROXY_TEST_SLOW_MS = 8_000;
const PROXY_TEST_SLOW_SECS = PROXY_TEST_SLOW_MS / 1000;

export type ProxyTestState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; message: string }
  | { kind: "fail"; message: string };

export function useProxyTest() {
  const [state, setState] = useState<ProxyTestState>({ kind: "idle" });
  const [elapsedSecs, setElapsedSecs] = useState<number>(0);
  const runIdRef = useRef<number>(0);
  const running = state.kind === "testing";
  const slow = running && elapsedSecs >= PROXY_TEST_SLOW_SECS;

  useEffect(() => {
    if (!running) {
      setElapsedSecs(0);
      return;
    }
    const ticker = createInterval(() => setElapsedSecs((seconds) => seconds + 1), 1000);
    return () => ticker.cancel();
  }, [running]);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    setState({ kind: "idle" });
  }, []);

  const run = useCallback(async (test: () => Promise<string>) => {
    const runId = ++runIdRef.current;
    setElapsedSecs(0);
    setState({ kind: "testing" });
    const result = await attemptResult(Promise.resolve().then(test));
    if (runId !== runIdRef.current) return;
    if (!result.ok) {
      setState({ kind: "fail", message: result.error.message });
      return;
    }
    setState({ kind: "ok", message: result.value });
  }, []);

  return { state, running, slow, elapsedSecs, run, cancel, reset: cancel };
}
