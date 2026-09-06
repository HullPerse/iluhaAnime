// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JobCenterPanel } from "@/components/shared/jobs.component";
import { useJobsStore } from "@/store/jobs.store";
import { useUpscaleQueueStore } from "@/store/upscale.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

afterEach(() => {
  cleanup();
  mockInvoke.mockReset();
  useJobsStore.setState({ jobs: {}, panelOpen: false });
});

describe("JobCenterPanel", () => {
  it("renders nothing while closed", () => {
    useJobsStore.setState({
      jobs: {
        a: {
          id: "a",
          title: "Job A",
          stage: "",
          done: 1,
          total: 2,
          status: "running",
          failures: [],
        },
      },
      panelOpen: false,
    });
    const { container } = render(<JobCenterPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("lists manual jobs with counts and cancels them", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    useJobsStore.setState({
      panelOpen: true,
      jobs: {
        a: {
          id: "a",
          title: "Job A",
          stage: "half",
          done: 1,
          total: 2,
          status: "running",
          failures: ["x"],
          onCancel,
        },
      },
    });
    render(<JobCenterPanel />);
    expect(screen.getByText("Job A")).toBeDefined();
    expect(screen.getByText("1/2")).toBeDefined();
    expect(screen.getByText("x")).toBeDefined();
    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(useJobsStore.getState().jobs["a"]?.status).toBe("cancelled");
  });

  it("mirrors upscale queue items with stage detail", () => {
    useUpscaleQueueStore.setState({
      items: [
        {
          id: "q1",
          jobType: "upscale",
          filePath: "/a.mkv",
          outputPath: "/b.mkv",
          name: "a.mkv",
          config: {
            width: 0,
            height: 0,
            targetFps: null,
            interpolate: false,
            quality: "balanced",
            gpuBackend: "gpu",
            videoCodec: "h264",
            aiUpscaler: "realcugan",
          },
          status: "processing",
          progress: 50,
          current: 5,
          total: 10,
          stage: "upscaling",
        },
      ],
    } as never);
    useJobsStore.setState({ panelOpen: true });
    render(<JobCenterPanel />);
    expect(screen.getByText("a.mkv")).toBeDefined();
    expect(screen.getByText(/realcugan/)).toBeDefined();
  });
});
