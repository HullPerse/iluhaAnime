import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "@/components/shared/modal.component";
import { patchSettings } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
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

describe("Modal animation", () => {
  it("fades and zooms the popup in when the setting is on", async () => {
    patchSettings({ language: "en", modalAnimation: true });
    render(
      <Modal header="Test" onClose={() => undefined}>
        <span>body</span>
      </Modal>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.classList.contains("modal-motion")).toBe(true);
    expect(dialog.className).toContain("scale-[0.97]");
    expect(document.querySelectorAll(".modal-motion")).toHaveLength(2);

    await waitFor(() => expect(dialog.classList.contains("opacity-100")).toBe(true));
    expect(dialog.classList.contains("scale-[0.97]")).toBe(false);
  });

  it("renders without motion classes when the setting is off", () => {
    patchSettings({ language: "en", modalAnimation: false });
    render(
      <Modal header="Test" onClose={() => undefined}>
        <span>body</span>
      </Modal>
    );

    expect(screen.getByRole("dialog").classList.contains("modal-motion")).toBe(false);
    expect(document.querySelectorAll(".modal-motion")).toHaveLength(0);
  });
});

describe("Modal content animation", () => {
  const installAnimateMock = () => {
    return vi.fn(() => ({ cancel: vi.fn() }));
  };

  it("does not animate on re-renders with the same content structure", () => {
    patchSettings({ language: "en", modalAnimation: false, animateModalContent: true });
    const animate = installAnimateMock();
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animate,
    });

    const { rerender } = render(
      <Modal header="Test" onClose={() => undefined}>
        <span>body</span>
      </Modal>
    );
    rerender(
      <Modal header="Test" onClose={() => undefined}>
        <span>body</span>
      </Modal>
    );

    expect(animate).not.toHaveBeenCalled();
  });

  it("animates when the content structure changes", () => {
    patchSettings({ language: "en", modalAnimation: false, animateModalContent: true });
    const animate = installAnimateMock();
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value: animate,
    });

    const { rerender } = render(
      <Modal header="Test" onClose={() => undefined}>
        <span>body</span>
      </Modal>
    );
    rerender(
      <Modal header="Test" onClose={() => undefined}>
        <div>body</div>
      </Modal>
    );

    expect(animate).toHaveBeenCalled();
  });
});

describe("Modal resize observer", () => {
  it("attaches the observer to the portalled popup", () => {
    const observed: Element[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(target: Element): void {
          observed.push(target);
        }
        unobserve(): void {}
        disconnect(): void {}
      }
    );
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    patchSettings({ language: "en", modalAnimation: true });

    render(
      <Modal header="Test" onClose={() => undefined}>
        <span>body</span>
      </Modal>
    );

    expect(observed).toEqual([screen.getByRole("dialog")]);
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
