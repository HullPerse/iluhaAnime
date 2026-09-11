import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FriendListsView } from "@/routes/components/anilist/lists.anilist";
import { useSettingsStore } from "@/store/settings.store";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

function listsPayload() {
  return [
    {
      name: "Watching",
      entries: [
        {
          media: { id: 21, title: "One Piece", cover_url: null },
          progress: 5,
          score: 8,
        },
      ],
    },
    { name: "Completed", entries: [] },
  ];
}

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  mockInvoke.mockReset();
});

describe("FriendListsView", () => {
  it("renders list rows and opens anime on click", async () => {
    const user = userEvent.setup();
    const onAnime = vi.fn();
    mockInvoke.mockResolvedValue(listsPayload());
    render(<FriendListsView friendId={7} onAnime={onAnime} />);

    await user.click(await screen.findByTitle("One Piece"));

    expect(screen.getByText("Watching (1)")).toBeTruthy();
    expect(onAnime).toHaveBeenCalledWith(21);
  });

  it("shows an empty state without public lists", async () => {
    mockInvoke.mockResolvedValue([]);
    render(<FriendListsView friendId={7} onAnime={() => {}} />);

    expect(await screen.findByText("No public lists")).toBeTruthy();
  });

  it("retries after a failure", async () => {
    const user = userEvent.setup();
    mockInvoke.mockRejectedValueOnce(new Error("offline"));
    mockInvoke.mockResolvedValue(listsPayload());
    render(<FriendListsView friendId={7} onAnime={() => {}} />);

    expect(await screen.findByText("offline", { exact: false })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByTitle("One Piece")).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledTimes(2);
  });
});
