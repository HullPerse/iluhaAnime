import { beforeEach, describe, expect, it, vi } from "vitest";

import { useJobsStore } from "@/store/jobs.store";
import type { JobItem } from "@/types/jobs";

const JOB: JobItem = {
  id: "a",
  title: "Job A",
  stage: "work",
  done: 1,
  total: 10,
  status: "running",
  failures: [],
};

beforeEach(() => {
  useJobsStore.setState({ jobs: {}, panelOpen: false });
});

describe("useJobsStore", () => {
  it("registers and updates progress", () => {
    const { upsertJob, updateProgress } = useJobsStore.getState();
    upsertJob(JOB);
    updateProgress("a", 5, 10, "half");
    const job = useJobsStore.getState().jobs["a"];
    expect(job?.done).toBe(5);
    expect(job?.stage).toBe("half");
  });

  it("finishes and clears finished jobs", () => {
    const { upsertJob, finishJob, clearFinished } = useJobsStore.getState();
    upsertJob(JOB);
    upsertJob({ ...JOB, id: "b" });
    finishJob("a");
    expect(useJobsStore.getState().jobs["a"]?.status).toBe("done");
    clearFinished();
    expect(useJobsStore.getState().jobs["a"]).toBeUndefined();
    expect(useJobsStore.getState().jobs["b"]).toBeDefined();
  });

  it("records failures and cancels with callback", () => {
    const onCancel = vi.fn();
    const { upsertJob, failJob, cancelJob } = useJobsStore.getState();
    upsertJob({ ...JOB, onCancel });
    failJob("a", "boom");
    expect(useJobsStore.getState().jobs["a"]?.failures).toEqual(["boom"]);
    cancelJob("a");
    expect(onCancel).toHaveBeenCalledOnce();
    expect(useJobsStore.getState().jobs["a"]?.status).toBe("cancelled");
  });

  it("ignores unknown ids", () => {
    const { updateProgress, finishJob, cancelJob, removeJob } = useJobsStore.getState();
    updateProgress("ghost", 1, 2);
    finishJob("ghost");
    cancelJob("ghost");
    removeJob("ghost");
    expect(useJobsStore.getState().jobs).toEqual({});
  });
});
