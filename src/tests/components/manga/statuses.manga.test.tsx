import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import MangaStatuses from "@/routes/components/manga/status/view.status";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

const manageStatus = vi.hoisted(() => vi.fn<() => Promise<void>>(async () => undefined));
vi.mock("@/api/manga.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/manga.api")>()),
  manageMangaStatus: manageStatus,
}));

afterEach(cleanup);

it("moves, edits and deletes of a custom manga status", async () => {
  patchSettings({ language: "ru", modalAnimation: false, animateModalContent: false });
  const onDeleted = vi.fn();
  const onHide = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MangaStatuses
        statuses={[
          { id: "planned", label: "В планах", color: "text" },
          { id: "custom:first", label: "Первый", color: "#112233" },
          { id: "custom:second", label: "Второй", color: "#445566" },
        ]}
        onDeleted={onDeleted}
        onHide={onHide}
        onClose={vi.fn()}
      />
    </QueryClientProvider>
  );

  const dialog = within(screen.getByRole("dialog"));
  const firstUp = dialog.getByRole("button", { name: "Вверх: Первый" });
  expect(firstUp.hasAttribute("disabled")).toBe(true);
  expect(dialog.queryByRole("button", { name: "Изменить: В планах" })).toBeNull();

  let finishMove = () => {};

  manageStatus.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishMove = resolve;
      })
  );
  fireEvent.click(dialog.getByRole("button", { name: "Скрыть: Первый" }));
  expect(settingsAtoms.mangaHiddenStatuses.get()).toEqual(["custom:first"]);
  expect(onHide).toHaveBeenCalledWith("custom:first");
  fireEvent.click(dialog.getByRole("button", { name: "Показать: Первый" }));
  expect(settingsAtoms.mangaHiddenStatuses.get()).toEqual([]);

  const move = dialog.getByRole("button", { name: "Вниз: Первый" });
  fireEvent.click(move);
  await waitFor(() =>
    expect(manageStatus).toHaveBeenLastCalledWith("custom:first", {
      kind: "move",
      up: false,
    })
  );

  await waitFor(() => {
    const rows = dialog.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(["Второй", "Первый"]);
  });
  expect(dialog.getByRole("textbox").hasAttribute("disabled")).toBe(false);
  finishMove();

  const edit = dialog.getByRole("button", { name: "Изменить: Первый" });
  await waitFor(() => expect(edit.hasAttribute("disabled")).toBe(false));
  fireEvent.click(edit);
  expect(
    within(dialog.getByRole("listitem", { current: true })).getByRole("button", {
      name: /Перетащить/,
    })
  ).toBeTruthy();
  fireEvent.change(dialog.getByRole("textbox", { name: "Название статуса" }), {
    target: { value: "Переименованный" },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Сохранить" }));
  await waitFor(() =>
    expect(manageStatus).toHaveBeenLastCalledWith("custom:first", {
      kind: "edit",
      label: "Переименованный",
      color: "#112233",
    })
  );

  const remove = dialog.getByRole("button", { name: "Удалить: Первый" });
  await waitFor(() => expect(remove.hasAttribute("disabled")).toBe(false));
  fireEvent.click(remove);
  await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("custom:first"));
  expect(manageStatus).toHaveBeenLastCalledWith("custom:first", {
    kind: "delete",
  });
});
