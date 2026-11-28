import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, it, expect, vi } from "vitest";
import GameCharacters from "@/routes/components/collection/gameCharacters.cards";
import { playCharacters, characterPortrait, charactersSearchIndex } from "@/api/characters.api";
import type { CharactersView } from "@/types/api/characters";
import { translate as t } from "@/lib/locale/i18n.utils";
import { showInfo } from "@/lib/core/ui/notification.utils";

vi.mock("@/api/characters.api", () => ({
  playCharacters: vi.fn(),
  characterPortrait: vi.fn(),
  charactersSearchIndex: vi.fn(),
}));
vi.mock("@/hooks/daily/queries.hook", () => ({
  useDailyGameHistory: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/core/ui/notification.utils", () => ({ showInfo: vi.fn() }));
let state: CharactersView;
beforeEach(() => {
  vi.mocked(showInfo).mockClear();
  const field = { submitted: "", solved: false, answer: null };
  state = {
    day: "2026-11-28",
    correct: 0,
    finished: false,
    rewardPackId: null,
    rounds: Array.from({ length: 5 }, () => ({
      tier: "easy",
      character: { ...field },
      anime: { ...field },
    })),
  };
  vi.mocked(playCharacters).mockImplementation(async (_day, answers, submit) => {
    if (answers && !state.finished) {
      state.rounds.forEach((round, i) => {
        for (const kind of ["character", "anime"] as const) {
          round[kind].submitted = answers[i][kind];

          if (submit) {
            round[kind].solved = answers[i][kind] === "Naruto";
            round[kind].answer = kind === "character" ? "Naruto Uzumaki" : "Naruto";
          }
        }
      });

      if (submit) {
        state.finished = true;
        state.correct = state.rounds
          .flatMap((r) => [r.character, r.anime])
          .filter((f) => f.solved).length;
      }
    }

    return structuredClone(state);
  });
  vi.mocked(characterPortrait).mockResolvedValue("data:image/png;base64,aA==");
  vi.mocked(charactersSearchIndex).mockResolvedValue({
    characters: [
      { id: 1, name: "Naruto Uzumaki", aliases: ["Наруто"] },
      { id: 2, name: "Sasuke Uchiha", aliases: ["Саске"] },
    ],
    anime: [
      { id: 10, name: "Naruto", aliases: ["Наруто: Ураганные хроники"] },
      { id: 11, name: "Bleach", aliases: ["Блич"] },
    ],
  });
});
it("checks the whole free-text sheet only after Answer, colors every field and opens the result", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <GameCharacters day={state.day} onClose={() => undefined} />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(10));
  await waitFor(() =>
    expect(screen.getAllByAltText(t("collection.game.characters.portrait"))).toHaveLength(5)
  );
  fireEvent.change(screen.getAllByLabelText(t("collection.game.characters.input"))[0], {
    target: { value: "Naruto" },
  });
  fireEvent.change(screen.getAllByLabelText(t("collection.game.characters.animeInput"))[1], {
    target: { value: "Naruto" },
  });
  expect(container.querySelectorAll("[data-correct]")).toHaveLength(0);
  expect(screen.queryByText("Naruto Uzumaki")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("collection.game.characters.submit") }));
  await waitFor(() => expect(container.querySelectorAll('[data-correct="true"]')).toHaveLength(2));
  expect(container.querySelectorAll('[data-correct="false"]')).toHaveLength(8);
  expect(screen.getAllByRole("combobox").every((input) => input.hasAttribute("readonly"))).toBe(
    true
  );
  expect(screen.queryByRole("button", { name: t("collection.game.characters.submit") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("collection.game.result") }));
  expect(await screen.findByText("2 / 10")).toBeTruthy();
  expect(screen.getByText(t("collection.game.characters.noReward"))).toBeTruthy();
  expect(screen.getByLabelText(t("collection.game.history"))).toBeTruthy();
  client.clear();
});
it("shows the pack toast after a fresh winning sheet but not on reopen", async () => {
  state.rewardPackId = "daily-2026-11-28-characters";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <GameCharacters day={state.day} onClose={() => undefined} />
    </QueryClientProvider>
  );

  await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(10));
  fireEvent.click(screen.getByRole("button", { name: t("collection.game.characters.submit") }));
  await waitFor(() => expect(showInfo).toHaveBeenCalledTimes(1));
  expect(showInfo).toHaveBeenCalledWith(
    t("collection.game.rewardNotice.title"),
    t("collection.game.reward")
  );

  unmount();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GameCharacters day={state.day} onClose={() => undefined} />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getAllByRole("combobox")).toHaveLength(10));
  expect(showInfo).toHaveBeenCalledTimes(1);
  client.clear();
});
it("suggests canonical character and anime names from the local index", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GameCharacters day={state.day} onClose={() => undefined} />
    </QueryClientProvider>
  );
  const characters = await screen.findAllByLabelText(t("collection.game.characters.input"));

  fireEvent.focus(characters[0]);
  fireEvent.change(characters[0], { target: { value: "нарут" } });
  fireEvent.click(await screen.findByRole("option", { name: /Naruto Uzumaki/ }));
  expect((characters[0] as HTMLInputElement).value).toBe("Naruto Uzumaki");

  const anime = screen.getAllByLabelText(t("collection.game.characters.animeInput"));

  fireEvent.focus(anime[0]);
  fireEvent.change(anime[0], { target: { value: "ураган" } });
  fireEvent.click(await screen.findByRole("option", { name: /Ураганные хроники/ }));
  expect((anime[0] as HTMLInputElement).value).toBe("Naruto");
  client.clear();
});
it("lets a failed portrait request retry while keeping the sheet unchecked", async () => {
  vi.mocked(characterPortrait).mockRejectedValue(new Error("offline"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GameCharacters day={state.day} onClose={() => undefined} />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.getAllByText(t("collection.game.characters.imageError"))).toHaveLength(5)
  );
  expect(screen.queryByRole("button", { name: t("collection.game.result") })).toBeNull();
  expect(screen.getAllByRole("combobox").every((input) => !input.hasAttribute("readonly"))).toBe(
    true
  );
  client.clear();
});
