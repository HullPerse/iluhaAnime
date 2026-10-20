import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("Modal close guard", () => {
  it("keeps the dialog open when canClose refuses", () => {
    patchSettings({ language: "en", modalAnimation: false });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose} canClose={() => false}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("closes when canClose allows it", () => {
    patchSettings({ language: "en", modalAnimation: false });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose} canClose={() => true}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Modal pager", () => {
  it("shows the position and jumps between images", () => {
    patchSettings({ language: "en", modalAnimation: false });
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <Modal
        header="Images"
        onClose={() => undefined}
        pager={{ index: 1, total: 4, label: "Images", onPrevious, onNext }}
      >
        <span>image</span>
      </Modal>
    );

    expect(screen.getByText("2 / 4")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("hides the controls for a single image", () => {
    patchSettings({ language: "en", modalAnimation: false });
    render(
      <Modal
        header="Images"
        onClose={() => undefined}
        pager={{ index: 0, total: 1, label: "Images", onPrevious: vi.fn(), onNext: vi.fn() }}
      >
        <span>image</span>
      </Modal>
    );

    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Images" })).toBeNull();
  });

  it("pages with the arrow keys", () => {
    patchSettings({ language: "en", modalAnimation: false });
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    render(
      <Modal
        header="Images"
        onClose={() => undefined}
        pager={{ index: 0, total: 2, onPrevious, onNext }}
      >
        <span>image</span>
      </Modal>
    );

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("leaves arrow keys alone inside a text field", () => {
    patchSettings({ language: "en", modalAnimation: false });
    const onNext = vi.fn();
    render(
      <Modal
        header="Images"
        onClose={() => undefined}
        pager={{ index: 0, total: 2, onPrevious: vi.fn(), onNext }}
      >
        <input aria-label="field" />
      </Modal>
    );

    fireEvent.keyDown(screen.getByLabelText("field"), { key: "ArrowRight" });

    expect(onNext).not.toHaveBeenCalled();
  });
});
