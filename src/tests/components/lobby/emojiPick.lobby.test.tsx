import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ChatLobby from "@/routes/components/lobby/chat.lobby";
import { useSettingsStore } from "@/store/settings.store";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${path}`,
  invoke: async () => undefined,
}));

// The real picker's grid is virtualized: jsdom has no layout, so it renders
// zero rows. Mock the wrapper to cover our wiring (pick -> draft) instead.
vi.mock("@/routes/components/lobby/emoji.lobby", () => ({
  default: ({ onPick }: { onPick: (emoji: string) => void }) => (
    <button onClick={() => onPick("😀")} type="button">
      mock emoji
    </button>
  ),
}));

let client: QueryClient;

function renderWithClient(element: ReactElement) {
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
});

describe("ChatLobby emoji selection", () => {
  it("appends the picked emoji to the draft", async () => {
    const onDraftChange = vi.fn();
    renderWithClient(
      <ChatLobby
        canAttach={false}
        draft="hi "
        messages={[]}
        pending={false}
        onAttach={() => undefined}
        onDraftChange={onDraftChange}
        onDownloadAttachment={() => undefined}
        onSend={() => undefined}
        onTorrentLink={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    const mockEmoji = await screen.findByRole("button", { name: "mock emoji" });
    fireEvent.click(mockEmoji);

    expect(onDraftChange).toHaveBeenCalledWith("hi 😀");
  });

  it("keeps the picker open after a pick (multi-emoji sends)", async () => {
    renderWithClient(
      <ChatLobby
        canAttach={false}
        draft=""
        messages={[]}
        pending={false}
        onAttach={() => undefined}
        onDraftChange={() => undefined}
        onDownloadAttachment={() => undefined}
        onSend={() => undefined}
        onTorrentLink={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Emoji" }));
    const mockEmoji = await screen.findByRole("button", { name: "mock emoji" });
    fireEvent.click(mockEmoji);

    expect(screen.getByRole("button", { name: "mock emoji" })).toBeTruthy();
  });
});
