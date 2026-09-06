import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import FastembedDownload from "@/routes/components/settings/fastembed.settings";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

type ProgressHandler = (e: { payload: { done: number; total: number } }) => void;
let progressHandler: ProgressHandler | null = null;
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: ProgressHandler) => {
    progressHandler = handler;
    return () => {
      progressHandler = null;
    };
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  progressHandler = null;
});

function renderInstalled() {
  return render(<FastembedDownload status="ok" setStatus={() => {}} />);
}

describe("fastembed backfill", () => {
  it("builds the semantic index and reports the embedded count", async () => {
    mockInvoke.mockResolvedValueOnce(12);
    renderInstalled();
    fireEvent.click(screen.getByText("Build semantic index"));
    expect(mockInvoke).toHaveBeenCalledWith("backfill_missing_embeddings", undefined);
    await screen.findByText("Indexed 12 entries");
  });

  it("shows live progress while the backfill runs", async () => {
    let resolveBackfill: (count: number) => void = () => {};
    mockInvoke.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolveBackfill = resolve;
        })
    );
    renderInstalled();
    fireEvent.click(screen.getByText("Build semantic index"));
    progressHandler?.({ payload: { done: 5, total: 100 } });
    await screen.findByText("Indexing 5/100...");
    resolveBackfill(100);
    await screen.findByText("Indexed 100 entries");
  });

  it("surfaces backfill failures", async () => {
    mockInvoke.mockRejectedValueOnce("model gone");
    renderInstalled();
    fireEvent.click(screen.getByText("Build semantic index"));
    await screen.findByText("Indexing failed: model gone");
  });
});
