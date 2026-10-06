import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTransportInflight } from "@/api/transport.api";
import ReactionRow, { REACTION_QUICK_EMOJIS } from "@/routes/components/lobby/reaction-row.lobby";
import { useSettingsStore } from "@/store/settings.store";
import type { ReactionEntry } from "@/types/session";

let client: QueryClient;

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
  resetTransportInflight();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(cleanup);

function renderRow(
  props: {
    entries?: ReactionEntry[];
    myPeerId?: string | null;
    onReact?: (input: { messageId: string; emoji: string; add: boolean }) => void;
  } = {},
) {
  const onReact = props.onReact ?? vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ReactionRow
        entries={props.entries ?? []}
        messageId="m1"
        myPeerId={props.myPeerId ?? null}
        onReact={onReact}
      />
    </QueryClientProvider>,
  );
  return { onReact };
}

describe("ReactionRow", () => {
  it("renders a pill per entry with the peer count", () => {
    renderRow({
      entries: [
        { emoji: "👍", messageId: "m1", peers: ["p1"] },
        { emoji: "❤️", messageId: "m1", peers: ["p1", "p2"] },
      ],
      myPeerId: "p3",
    });

    expect(screen.getByTitle("1 reacted")).toBeTruthy();
    expect(screen.getByTitle("2 reacted")).toBeTruthy();
    expect(screen.getByTitle("1 reacted").getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("toggles off when the peer already reacted to the entry", () => {
    const { onReact } = renderRow({
      entries: [{ emoji: "👍", messageId: "m1", peers: ["p1", "p2"] }],
      myPeerId: "p2",
    });

    const pill = screen.getByTitle("2 reacted");
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pill);

    expect(onReact).toHaveBeenCalledWith({
      add: false,
      emoji: "👍",
      messageId: "m1",
    });
  });

  it("toggles on when the peer has not reacted yet", () => {
    const { onReact } = renderRow({
      entries: [{ emoji: "👍", messageId: "m1", peers: ["p1"] }],
      myPeerId: "p2",
    });

    fireEvent.click(screen.getByTitle("1 reacted"));

    expect(onReact).toHaveBeenCalledWith({
      add: true,
      emoji: "👍",
      messageId: "m1",
    });
  });

  it("reveals the quick-emoji row behind the plus button", () => {
    renderRow({});

    const add = screen.getByRole("button", { name: "Add reaction" });
    expect(add.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(add);

    expect(add.getAttribute("aria-expanded")).toBe("true");
    for (const emoji of REACTION_QUICK_EMOJIS) {
      expect(screen.getByTitle(emoji)).toBeTruthy();
    }
  });

  it("picks a quick emoji, applies it, and closes the row", () => {
    const { onReact } = renderRow({});

    const add = screen.getByRole("button", { name: "Add reaction" });
    fireEvent.click(add);
    fireEvent.click(screen.getByTitle("🎉"));

    expect(onReact).toHaveBeenCalledWith({
      add: true,
      emoji: "🎉",
      messageId: "m1",
    });
    expect(add.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTitle("🎉")).toBeNull();
  });
});
