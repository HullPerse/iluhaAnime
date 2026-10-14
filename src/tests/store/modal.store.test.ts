import { describe, expect, it } from "vitest";

import {
  clearAllModals,
  createModalSignalStore,
  modalAtoms,
  modalDepth,
  popModal,
  pushModal,
  resetModalAtoms,
  topModal,
  type ModalSignalStore,
} from "@/store/modal.store";
import type { ModalEntry, ModalScope } from "@/types/modal";

function seed(
  store: ModalSignalStore,
  scope: ModalScope,
  entries: Array<{ key: string; params?: ModalEntry["params"] }>
): void {
  for (const entry of entries) store.push(scope, entry.key, entry.params);
}

describe("modal stack push and pop", () => {
  it("pushes entries with increasing ids and reports the stack order", () => {
    const store = createModalSignalStore();
    seed(store, "anilist", [{ key: "spotlight" }, { key: "detail", params: { animeId: 21 } }]);
    const stack = store.atoms.stacks.get().anilist;
    expect(stack).toHaveLength(2);
    expect(stack[1]?.id).toBeGreaterThan(stack[0]?.id ?? 0);
    expect(stack.at(-1)).toMatchObject({ key: "detail", params: { animeId: 21 } });
  });

  it("tracks each scope independently through the factory handle", () => {
    const store = createModalSignalStore();
    seed(store, "search", [{ key: "filters" }]);
    seed(store, "collection", [{ key: "detail" }]);
    expect(store.atoms.stacks.get().search).toHaveLength(1);
    expect(store.atoms.stacks.get().collection).toHaveLength(1);
    expect(store.atoms.stacks.get().anilist).toHaveLength(0);
  });

  it("pops the top entry and returns null once empty", () => {
    const store = createModalSignalStore();
    seed(store, "player", [{ key: "settings" }, { key: "cheatsheet" }]);
    expect(store.pop("player")?.key).toBe("cheatsheet");
    expect(store.pop("player")?.key).toBe("settings");
    expect(store.pop("player")).toBeNull();
    expect(store.atoms.stacks.get().player).toHaveLength(0);
  });

  it("keeps entry params on the stack", () => {
    const store = createModalSignalStore();
    store.push("torrent", "queue", { order: "asc", limit: 20 });
    expect(store.atoms.stacks.get().torrent[0]).toMatchObject({
      key: "queue",
      params: { order: "asc", limit: 20 },
    });
  });
});

describe("modal stack replace", () => {
  it("swaps the top entry without growing the stack", () => {
    const store = createModalSignalStore();
    seed(store, "anilist", [{ key: "spotlight" }]);
    store.replace("anilist", "detail", { animeId: 7 });
    const stack = store.atoms.stacks.get().anilist;
    expect(stack).toHaveLength(1);
    expect(stack[0]).toMatchObject({ key: "detail", params: { animeId: 7 } });
  });

  it("pushes when the scope is empty", () => {
    const store = createModalSignalStore();
    store.replace("settings", "editor");
    expect(store.atoms.stacks.get().settings).toHaveLength(1);
  });
});

describe("modal stack clearing", () => {
  it("clears one scope and leaves the others alone", () => {
    const store = createModalSignalStore();
    seed(store, "search", [{ key: "details" }, { key: "filters" }]);
    seed(store, "anilist", [{ key: "browse" }]);
    store.clearScope("search");
    expect(store.atoms.stacks.get().search).toHaveLength(0);
    expect(store.atoms.stacks.get().anilist).toHaveLength(1);
  });

  it("clears every scope at once", () => {
    const store = createModalSignalStore();
    seed(store, "app", [{ key: "updater" }]);
    seed(store, "torrent", [{ key: "peers" }]);
    store.clearAll();
    expect(store.atoms.stacks.get().app).toHaveLength(0);
    expect(store.atoms.stacks.get().torrent).toHaveLength(0);
  });
});

describe("modal stack notifications", () => {
  it("notifies once per action without batching", () => {
    const store = createModalSignalStore();
    let calls = 0;
    store.atoms.stacks.subscribe(() => {
      calls += 1;
    });
    seed(store, "anilist", [{ key: "spotlight" }, { key: "detail" }]);
    expect(calls).toBe(2);
  });

  it("notifies once for a batched open flow", () => {
    const store = createModalSignalStore();
    let calls = 0;
    store.atoms.stacks.subscribe(() => {
      calls += 1;
    });
    store.batch(() => {
      seed(store, "anilist", [{ key: "spotlight" }, { key: "detail" }]);
    });
    expect(calls).toBe(1);
    expect(store.atoms.stacks.get().anilist).toHaveLength(2);
  });
});

describe("modal singleton helpers", () => {
  it("reads top and depth from the shared singleton", () => {
    resetModalAtoms();
    pushModal("collection", "wizard");
    expect(modalDepth("collection")).toBe(1);
    pushModal("collection", "confirm", { dirty: true });
    expect(topModal("collection")?.key).toBe("confirm");
    expect(modalDepth("collection")).toBe(2);
    expect(popModal("collection")?.key).toBe("confirm");
    expect(modalDepth("collection")).toBe(1);
    resetModalAtoms();
  });

  it("resets every scope and restarts ids", () => {
    pushModal("app", "updater");
    expect(modalDepth("app")).toBe(1);
    resetModalAtoms();
    expect(modalDepth("app")).toBe(0);
    expect(topModal("app")).toBeNull();
    expect(modalAtoms.stacks.get().search).toHaveLength(0);
    expect(pushModal("app", "updater")).toBe(1);
    clearAllModals();
  });
});
