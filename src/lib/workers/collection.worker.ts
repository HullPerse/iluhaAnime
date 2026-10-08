import {
  createCollectionFilterSnapshot,
  queryCollectionFilterSnapshot,
} from "@/lib/collection/filter.utils";
import type { CollectionFilterSnapshot } from "@/lib/collection/filter.utils";
import { attemptSync } from "@/lib/utils/attempt.utils";
import type {
  WorkerJobEnvelope,
  WorkerJobResponse,
} from "@/lib/workers/job.utils";
import type {
  CollectionFilterWorkerPayload,
  CollectionFilterWorkerResult,
} from "@/types/collection";

let snapshot: CollectionFilterSnapshot | null = null;

const scope = self as unknown as Worker;

scope.onmessage = (event: MessageEvent<WorkerJobEnvelope<CollectionFilterWorkerPayload>>) => {
  const { id, payload } = event.data;
  if (payload.kind === "init") {
    snapshot = createCollectionFilterSnapshot(payload.items, payload.statuses);
    const ack: WorkerJobResponse<CollectionFilterWorkerResult> = {
      id,
      ok: true,
      result: null,
    };
    scope.postMessage(ack, []);
    return;
  }
  const current = snapshot;
  const [ids, error] = attemptSync(() =>
    current ? queryCollectionFilterSnapshot(current, payload) : []
  );
  const response: WorkerJobResponse<CollectionFilterWorkerResult> = error
    ? { id, ok: false, error: error.message }
    : { id, ok: true, result: ids };
  scope.postMessage(response, []);
};
