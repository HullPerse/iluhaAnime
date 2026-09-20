import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PosterTile } from "@/components/shared/posterTile.component";
import { useSettingsStore } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("PosterTile", () => {
  it("names the tile after the entry and reports the click", async () => {
    const onSelect = vi.fn();
    render(<PosterTile src={null} label="Eren Yeager" sublabel="Main" onSelect={onSelect} />);

    const tile = screen.getByRole("button", { name: "Eren Yeager" });
    expect(tile.getAttribute("title")).toBe("Eren Yeager");

    await userEvent.setup().click(tile);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("keeps the extra detail in the tooltip instead of the accessible name", () => {
    render(<PosterTile src={null} label="Mikasa" title="Mikasa · 9/10" sublabel="Supporting" />);

    const tile = screen.getByRole("button", { name: "Mikasa" });
    expect(tile.getAttribute("title")).toBe("Mikasa · 9/10");
    expect(tile.textContent).toContain("Supporting");
  });

  it("marks a favourite and shows the badge", () => {
    const { container } = render(<PosterTile src={null} label="Levi" favourite badge="12" />);

    expect(container.querySelector(".lucide-heart")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Levi" }).textContent).toContain("12");
  });

  it("keeps the preview hidden until the tile is hovered, then drops it again", async () => {
    const user = userEvent.setup();
    render(<PosterTile src={null} label="Eren" preview={<span>Yuki Kaji</span>} />);

    expect(screen.queryByText("Yuki Kaji")).toBeNull();
    // The card replaces the browser tooltip rather than stacking on top of it.
    expect(screen.getByRole("button", { name: "Eren" }).getAttribute("title")).toBeNull();
    await user.hover(screen.getByRole("button", { name: "Eren" }));
    expect(await screen.findByText("Yuki Kaji", {}, { timeout: 3000 })).toBeDefined();

    await user.unhover(screen.getByRole("button", { name: "Eren" }));
    await waitFor(() => expect(screen.queryByText("Yuki Kaji")).toBeNull());
  });

  it("opens the card from the keyboard too", async () => {
    const user = userEvent.setup();
    render(<PosterTile src={null} label="Eren" preview={<span>Yuki Kaji</span>} />);

    await user.tab();

    expect(await screen.findByText("Yuki Kaji", {}, { timeout: 3000 })).toBeDefined();
  });

  it("lets a navigating card dismiss itself", async () => {
    const user = userEvent.setup();
    render(
      <PosterTile
        src={null}
        label="Eren"
        preview={(close) => (
          <button type="button" onClick={close}>
            Yuki Kaji
          </button>
        )}
      />
    );

    await user.hover(screen.getByRole("button", { name: "Eren" }));
    await user.click(await screen.findByText("Yuki Kaji", {}, { timeout: 3000 }));

    // The card floats above whatever the click opened, so it cannot wait for the pointer to leave.
    await waitFor(() => expect(screen.queryByText("Yuki Kaji")).toBeNull());
  });

  it("stays a plain button when it has nothing extra to show", async () => {
    const user = userEvent.setup();
    render(<PosterTile src={null} label="Armin" />);

    await user.hover(screen.getByRole("button", { name: "Armin" }));

    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(screen.getByRole("button", { name: "Armin" })).toBeDefined();
  });

  it("leaves an empty favourite unmarked and drops an empty sublabel", () => {
    const { container } = render(<PosterTile src={null} label="Armin" sublabel="" />);

    expect(container.querySelector(".lucide-heart")).toBeNull();
    expect(screen.getByRole("button", { name: "Armin" }).textContent).toContain("Armin");
  });
});
