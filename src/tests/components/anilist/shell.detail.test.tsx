import { mockConvertFileSrc, mockInvoke as invokeMock } from "@/tests/mocks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import { AnimeDetailShell } from "@/routes/components/anilist/detail/shell.detail";
import { patchSettings } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  convertFileSrc: mockConvertFileSrc,
}));

const wrapper = ({ children }: { children: ReactNode }) => {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
};

describe("AnimeDetailShell transport", () => {
  beforeEach(() => {
    patchSettings({ language: "en", modalAnimation: false, anilistProxyUrl: null });
    invokeMock.mockReset();
    resetTransportInflight();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_anime_full") {
        return Promise.resolve({
          media: { id: 21, title: "T" },
          characters: [],
          staff: [],
          recommendations: [],
        });
      }
      if (command === "get_anime_franchise") {
        return Promise.resolve({ root_id: 21, nodes: [], edges: [] });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("starts the full bundle and the franchise prefetch exactly once each on mount", async () => {
    render(
      <AnimeDetailShell
        animeId={21}
        isLoggedIn={false}
        onTag={() => undefined}
        onGenre={() => undefined}
        onClose={() => undefined}
        render={() => null}
      />,
      { wrapper }
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_anime_full", { id: 21 });
      expect(invokeMock).toHaveBeenCalledWith("get_anime_franchise", { id: 21, scope: "all" });
    });

    const commands = invokeMock.mock.calls.map(([command]) => String(command));
    expect(commands.filter((command) => command === "get_anime_full")).toHaveLength(1);
    // The franchise prefetch runs in parallel with the bundle instead of
    // waiting for it to resolve first.
    expect(commands.filter((command) => command === "get_anime_franchise")).toHaveLength(1);
    // The slot render keeps child sections out; the prefetch is the only
    // transport chatter the shell itself adds on mount.
    expect(commands).toHaveLength(2);
  });
});
