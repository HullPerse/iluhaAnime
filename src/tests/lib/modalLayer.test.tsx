import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "@/components/shared/modal.component";
import { createVimEngine } from "@/lib/engineHotkeys.utils";
import type { VimEngine } from "@/lib/engineHotkeys.utils";
import { scanHintTargets } from "@/lib/hintsHotkeys.utils";
import { isInsideLayer, topLayerElement } from "@/lib/layerHotkeys.utils";
import { patchSettings } from "@/store/settings.store";

function box(node: HTMLElement): HTMLElement {
  node.getBoundingClientRect = () =>
    ({
      top: 10,
      left: 10,
      bottom: 30,
      right: 60,
      width: 50,
      height: 20,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    }) as DOMRect;
  return node;
}

const engines: VimEngine[] = [];

afterEach(() => {
  for (const engine of engines.splice(0)) engine.detach();
  cleanup();
});

describe("modal-scoped hints", () => {
  function openModal(): { dialog: HTMLElement; inside: HTMLElement; behind: HTMLElement } {
    patchSettings({ language: "en", modalAnimation: false });
    const behind = box(document.createElement("button"));
    document.body.append(behind);
    render(
      <Modal header="Test" onClose={() => undefined}>
        <button type="button">ok</button>
      </Modal>
    );
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("dialog missing");
    box(dialog);
    const inside = box(screen.getByRole("button", { name: "ok" }));
    return { dialog, inside, behind };
  }

  it("treats the open dialog as the top layer", () => {
    const { dialog } = openModal();
    expect(topLayerElement()).toBe(dialog);
  });

  it("serves the hint trigger from inside the dialog", () => {
    const { inside } = openModal();
    const onCommand = vi.fn();
    const engine = createVimEngine({
      isEnabled: () => true,
      isOwner: (target) => isInsideLayer(target, topLayerElement()),
      onCommand,
    });
    engine.attach();
    engines.push(engine);

    inside.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyF" }));

    expect(onCommand).toHaveBeenCalledWith("hints", expect.anything());
  });

  it("labels the dialog's own controls and nothing behind it", () => {
    const { inside, behind } = openModal();
    const layer = topLayerElement();
    if (!layer) throw new Error("layer missing");

    const found = scanHintTargets(layer).badges.map((badge) => badge.element);

    expect(found).toEqual([inside]);
    expect(found).not.toContain(behind);
  });
});
