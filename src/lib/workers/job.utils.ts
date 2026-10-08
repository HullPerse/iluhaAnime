import { attemptSync } from "@/lib/utils/attempt.utils";

export interface WorkerJobEnvelope<P> {
  id: number;
  payload: P;
}

export interface WorkerJobDone<R> {
  id: number;
  ok: true;
  result: R;
}

export interface WorkerJobFailed {
  id: number;
  ok: false;
  error: string;
}

export type WorkerJobResponse<R> = WorkerJobDone<R> | WorkerJobFailed;

export interface JobRunnerOptions<P, R> {
  createWorker: () => Worker;
  onResult: (result: R) => void;
  onError?: (error: unknown) => void;
  runSync?: (payload: P) => R;
}

export interface JobRunner<P> {
  run: (payload: P, transfer?: Transferable[]) => void;
  dispose: () => void;
}

export function createJobRunner<P, R>(options: JobRunnerOptions<P, R>): JobRunner<P> {
  const { createWorker, onResult, onError, runSync } = options;
  let worker: Worker | null = null;
  let epoch = 0;
  let disposed = false;

  const handleMessage = (event: MessageEvent) => {
    const data = event.data as WorkerJobResponse<R> | undefined;
    if (!data || data.id !== epoch) return;
    if (!data.ok) {
      if (onError) onError(new Error(data.error));
      return;
    }
    onResult(data.result);
  };

  const dropWorker = () => {
    worker?.terminate();
    worker = null;
  };

  const handleError = () => {
    dropWorker();
    if (onError) onError(new Error("worker failed"));
  };

  return {
    run(payload, transfer) {
      if (disposed) return;
      epoch += 1;
      const id = epoch;
      if (!worker) {
        const [created, error] = attemptSync(createWorker);
        if (error || !created) {
          if (runSync) onResult(runSync(payload));
          else if (onError) onError(error ?? new Error("worker unavailable"));
          return;
        }
        worker = created;
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
      }
      worker.postMessage({ id, payload } satisfies WorkerJobEnvelope<P>, transfer ?? []);
    },
    dispose() {
      disposed = true;
      dropWorker();
    },
  };
}
