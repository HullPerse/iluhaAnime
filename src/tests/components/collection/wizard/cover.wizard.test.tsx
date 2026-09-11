import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WizardCoverPanel } from "@/routes/components/collection/wizard/cover.wizard";
import { useSettingsStore } from "@/store/settings.store";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

afterEach(() => {
  cleanup();
  invokeMock.mockReset();
});

beforeEach(() => {
  useSettingsStore.setState({ tmdbProxyUrl: null });
});

function renderPanel(coverUrl = "https://img/cover.jpg") {
  return render(
    <WizardCoverPanel
      coverOptions={[]}
      coverUrl={coverUrl}
      setCoverUrl={() => {}}
      setCoverOptions={() => {}}
      title="Naruto"
    />
  );
}

describe("WizardCoverPanel preview", () => {
  it("renders the raw url without a proxy", () => {
    renderPanel();
    expect(screen.getByAltText("selected").getAttribute("src")).toBe(
      "https://img/cover.jpg"
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("keeps a fixed-size slot while the cached preview resolves", async () => {
    useSettingsStore.setState({ tmdbProxyUrl: "http://127.0.0.1:10809" });
    invokeMock.mockResolvedValue({ id: "c1", path: "C:/images/c1.jpg" });
    const { container } = renderPanel();
    const slot = container.querySelector(".h-16.w-12");
    expect(slot).not.toBeNull();
  });

  it("reserves no preview slot without a cover", () => {
    const { container } = renderPanel("");
    expect(container.querySelector(".h-16.w-12")).toBeNull();
  });
});
