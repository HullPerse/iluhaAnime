import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, it, expect, vi } from "vitest";
import GameCharacters from "@/routes/components/collection/gameCharacters.cards";
import { playCharacters, characterPortrait } from "@/api/characters.api";
import type { CharactersView } from "@/types/api/characters";
import { translate as t } from "@/lib/locale/i18n.utils";

vi.mock("@/api/characters.api", () => ({ playCharacters: vi.fn(), characterPortrait: vi.fn() }));
let state: CharactersView;
beforeEach(() => {
  const field = { submitted: "", solved: false, answer: null };
  state = {
    day: "2026-11-28",
    correct: 0,
    finished: false,
    rewardPackId: null,
    history: [],
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
});
it("checks the whole free-text sheet only after Answer, colors every field and opens the result", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <GameCharacters day={state.day} onClose={() => undefined} />
    </QueryClientProvider>
  );
  await waitFor(() => expect(screen.getAllByRole("textbox")).toHaveLength(10));
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
  expect(screen.getAllByRole("textbox").every((input) => input.hasAttribute("readonly"))).toBe(
    true
  );
  expect(screen.queryByRole("button", { name: t("collection.game.characters.submit") })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: t("collection.game.result") }));
  expect(await screen.findByText("2 / 10")).toBeTruthy();
  expect(screen.getByText(t("collection.game.characters.noReward"))).toBeTruthy();
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
  expect(screen.getAllByRole("textbox").every((input) => !input.hasAttribute("readonly"))).toBe(
    true
  );
  client.clear();
});
