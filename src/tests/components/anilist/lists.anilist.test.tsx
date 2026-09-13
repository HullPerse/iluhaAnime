import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AniListListsRow from "@/routes/components/anilist/lists.anilist";
import { useSettingsStore } from "@/store/settings.store";

const TABS = [
  { id: "Current", label: "Watching (2)", color: "#e6b800" },
  { id: "Planning", label: "Planning (1)", color: "#2196f3" },
  { id: "Completed", label: "Completed (0)", color: "#4caf50" },
];

function renderRow(activeTab = "Current", onChange: (id: string) => void = () => {}) {
  useSettingsStore.setState({ language: "en" });
  return render(<AniListListsRow tabs={TABS} activeTab={activeTab} onChange={onChange} />);
}

afterEach(() => {
  cleanup();
});

describe("AniListListsRow", () => {
  it("pages through tabs with the chevrons and wraps around", async () => {
    const user = userEvent.setup();
    renderRow();
    expect(screen.getByText("Watching (2)")).not.toBeNull();
    expect(screen.queryByText("Planning (1)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Planning (1)")).not.toBeNull();
    expect(screen.queryByText("Watching (2)")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Watching (2)")).not.toBeNull();
  });

  it("follows the active tab onto its page", () => {
    const { rerender } = renderRow();
    expect(screen.queryByText("Completed (0)")).toBeNull();
    rerender(<AniListListsRow tabs={TABS} activeTab="Completed" onChange={() => {}} />);
    expect(screen.getByText("Completed (0)")).not.toBeNull();
  });

  it("selects a tab on click and marks it current", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = renderRow("Current", onChange);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Planning (1)" }));
    expect(onChange).toHaveBeenCalledWith("Planning");
    rerender(<AniListListsRow tabs={TABS} activeTab="Planning" onChange={onChange} />);
    expect(
      screen.getByRole("button", { name: "Planning (1)" }).getAttribute("aria-current")
    ).toBe("true");
  });
});
