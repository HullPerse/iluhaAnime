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
