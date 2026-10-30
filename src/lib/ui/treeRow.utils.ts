import { clickRowActionButton, dispatchClick } from "@/lib/core/dispatchHotkeys.utils";
import { setVimCount } from "@/store/vim.store";

export const rowElement = (target: EventTarget | null): HTMLElement | null => {
  return target instanceof HTMLElement ? target.closest<HTMLElement>("[data-tree-row]") : null;
};

export const findRow = (root: HTMLElement | null, path: string): HTMLElement | null => {
  if (!root) return null;
  for (const row of root.querySelectorAll<HTMLElement>("[data-tree-row]")) {
    if (row.dataset.treePath === path) return row;
  }
  return null;
};

export const runRowAction = (row: HTMLElement, action: string): void => {
  if (action === "reveal") {
    const name = row.querySelector<HTMLElement>("[data-tree-activate]");
    if (name) dispatchClick(name, "contextmenu");
    return;
  }
  clickRowActionButton(row, action);
};

export const activateTreeRow = (row: HTMLElement): void => {
  setVimCount("");
  if (row.dataset.treeKind === "file") {
    row.querySelector<HTMLElement>('[data-file-action="search"]')?.click();
  } else {
    row.querySelector<HTMLElement>("[data-tree-activate]")?.click();
  }
};
