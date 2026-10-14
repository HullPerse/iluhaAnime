import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "@/components/shared/modal.component";
import { patchSettings } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Modal stacking guard", () => {
  it("stays silent with a single dialog", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <Modal header="Test" onClose={() => undefined}>
        <span>ok</span>
      </Modal>
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a second dialog mounts on top", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <Modal header="First" onClose={() => undefined}>
        <span>first</span>
      </Modal>
    );
    render(
      <Modal header="Second" onClose={() => undefined}>
        <span>second</span>
      </Modal>
    );
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    await waitFor(() => expect(warn).toHaveBeenCalled());
  });
});
