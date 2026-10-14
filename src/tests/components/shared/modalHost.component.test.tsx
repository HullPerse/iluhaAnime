import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ModalHost } from "@/components/shared/modalHost.component";
import { clearModalScope, pushModal, resetModalAtoms } from "@/store/modal.store";
import { patchSettings } from "@/store/settings.store";
import type { ModalEntry } from "@/types/modal";

function resolve(entry: ModalEntry) {
  return {
    header: `title-${entry.key}`,
    body: <span>{`body-${entry.key}`}</span>,
  };
}

afterEach(() => {
  cleanup();
  resetModalAtoms();
  clearModalScope("search");
});

describe("ModalHost single slot", () => {
  it("renders nothing when the scope stack is empty", () => {
    patchSettings({ language: "en", modalAnimation: false });
    render(<ModalHost scope="search" resolve={resolve} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the top entry content in exactly one dialog", () => {
    patchSettings({ language: "en", modalAnimation: false });
    pushModal("search", "filters");
    render(<ModalHost scope="search" resolve={resolve} />);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("title-filters")).toBeDefined();
    expect(screen.getByText("body-filters")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  it("swaps content with a back button instead of stacking dialogs", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const user = userEvent.setup();
    pushModal("search", "filters");
    render(<ModalHost scope="search" resolve={resolve} />);
    pushModal("search", "details", { id: 5 });
    expect(await screen.findByText("body-details")).toBeDefined();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("body-filters")).toBeDefined();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("renders nothing when resolve returns null", () => {
    patchSettings({ language: "en", modalAnimation: false });
    pushModal("search", "filters");
    render(<ModalHost scope="search" resolve={() => null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clears the scope and calls onClose when the dialog closes", async () => {
    patchSettings({ language: "en", modalAnimation: false });
    const user = userEvent.setup();
    let closed = 0;
    pushModal("search", "filters");
    render(
      <ModalHost
        scope="search"
        resolve={resolve}
        onClose={() => {
          closed += 1;
        }}
      />
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(closed).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
