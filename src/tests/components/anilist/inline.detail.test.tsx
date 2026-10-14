import { mockInvoke as invokeMock } from "../../mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InlineDetail } from "@/routes/components/anilist/detail/inline.detail";
import { patchSettings } from "@/store/settings.store";
import type { ActivityDetailBundle } from "@/types/anilist";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`,
}));

const DETAIL: ActivityDetailBundle = {
  entryLookup: new Map(),
  favouriteIds: new Set(),
  isLoggedIn: false,
  onFavouriteToggle: () => Promise.resolve(),
  onTag: () => undefined,
  onGenre: () => undefined,
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  invokeMock.mockReset();
  patchSettings({ language: "en", modalAnimation: false, anilistProxyUrl: null });
  invokeMock.mockImplementation((command: string) => {
    if (command === "get_anime_full") return new Promise(() => undefined);
    return Promise.reject(new Error(`unexpected command ${command}`));
  });
});

describe("InlineDetail single slot", () => {
  it("renders the loading detail in exactly one dialog with a back button", async () => {
    render(
      <InlineDetail initialId={21} detail={DETAIL} onBack={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    expect(await screen.findByText("Loading...")).toBeDefined();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Back" })).toBeDefined();
  });

  it("calls onBack instead of onClose at the root of the stack", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(<InlineDetail initialId={21} detail={DETAIL} onBack={onBack} onClose={onClose} />, {
      wrapper,
    });
    await screen.findByText("Loading...");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
