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
    patchSettings({ language: "ru", modalAnimation: false });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    render(
      <Modal header="Test" onClose={() => undefined}>
        <span>ok</span>
      </Modal>
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toBeDefined());
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns when a second dialog mounts on top", async () => {
    patchSettings({ language: "ru", modalAnimation: false });
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
    patchSettings({ language: "ru", modalAnimation: false });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose} canClose={() => false}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("closes when canClose allows it", () => {
    patchSettings({ language: "ru", modalAnimation: false });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose} canClose={() => true}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Modal backdrop click", () => {
  const backdropOf = () => document.querySelector("[data-modal-backdrop]") as HTMLElement;

  it("keeps the dialog open while the setting is off", () => {
    patchSettings({ language: "ru", modalAnimation: false, modalCloseOnOutsideClick: false });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(backdropOf());

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the dialog when the setting is on", () => {
    patchSettings({ language: "ru", modalAnimation: false, modalCloseOnOutsideClick: true });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(backdropOf());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("respects canClose when the setting is on", () => {
    patchSettings({ language: "ru", modalAnimation: false, modalCloseOnOutsideClick: true });
    const onClose = vi.fn();
    render(
      <Modal header="Test" onClose={onClose} canClose={() => false}>
        <span>body</span>
      </Modal>
    );

    fireEvent.click(backdropOf());

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Modal pager", () => {
  it("shows the position and jumps between images", () => {
    patchSettings({ language: "ru", modalAnimation: false });
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
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("hides the controls for a single image", () => {
    patchSettings({ language: "ru", modalAnimation: false });
    render(
      <Modal
        header="Images"
        onClose={() => undefined}
        pager={{ index: 0, total: 1, label: "Images", onPrevious: vi.fn(), onNext: vi.fn() }}
      >
        <span>image</span>
      </Modal>
    );

    expect(screen.queryByRole("button", { name: "Далее" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Изображения" })).toBeNull();
  });

  it("pages with the arrow keys", () => {
    patchSettings({ language: "ru", modalAnimation: false });
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
    patchSettings({ language: "ru", modalAnimation: false });
    const onNext = vi.fn();
    render(
      <Modal
        header="Images"
        onClose={() => undefined}
        pager={{ index: 0, total: 2, onPrevious: vi.fn(), onNext }}
      >
        <input aria-label="Search query" />
      </Modal>
    );

    fireEvent.keyDown(screen.getByLabelText("Search query"), { key: "ArrowRight" });

    expect(onNext).not.toHaveBeenCalled();
  });
});
