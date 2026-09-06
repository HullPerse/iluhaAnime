import { create } from "zustand";

import type { JobItem, JobsStore } from "@/types/jobs";

export const useJobsStore = create<JobsStore>()((set, get) => ({
  jobs: {},
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  upsertJob: (job: JobItem) =>
    set((s) => ({ jobs: { ...s.jobs, [job.id]: { ...s.jobs[job.id], ...job } } })),
  updateProgress: (id, done, total, stage) =>
    set((s) => {
      const current = s.jobs[id];
      if (!current) return s;
      return {
        jobs: { ...s.jobs, [id]: { ...current, done, total, stage: stage ?? current.stage } },
      };
    }),
  finishJob: (id) =>
    set((s) => {
      const current = s.jobs[id];
      if (!current) return s;
      return { jobs: { ...s.jobs, [id]: { ...current, status: "done", done: current.total } } };
    }),
  failJob: (id, error) =>
    set((s) => {
      const current = s.jobs[id];
      if (!current) return s;
      return {
        jobs: {
          ...s.jobs,
          [id]: { ...current, status: "error", failures: [...current.failures, error] },
        },
      };
    }),
  cancelJob: (id) => {
    const current = get().jobs[id];
    current?.onCancel?.();
    set((s) => {
      const job = s.jobs[id];
      if (!job) return s;
      return { jobs: { ...s.jobs, [id]: { ...job, status: "cancelled" } } };
    });
  },
  removeJob: (id) =>
    set((s) => {
      if (!(id in s.jobs)) return s;
      const jobs = { ...s.jobs };
      delete jobs[id];
      return { jobs };
    }),
  clearFinished: () =>
    set((s) => ({
      jobs: Object.fromEntries(
        Object.entries(s.jobs).filter(([, job]) => job.status === "running")
      ),
    })),
}));
