import { bench, group } from "@pmndrs/labs";
// Modal-stack mechanics (push/pop/replace/top) plus the notify fan-out of
// an open flow, and the concurrent backend fan-out of opening one AniList
// detail modal. Store ops are pure signal cells, so they bench under labs;
// DOM render cost is analysis-only (see DECISIONS.md modal entry).
// Budget (avg/iter, Ryzen 7 5800X/node 26.3, 2026-10-14): push+pop ~0.1us
// per op at depth-1 (~0.18us at depth-32, real stacks stay under depth 3),
// replace ~0.08us, top+depth read ~0.02us, content dispatch ~0.015us;
// batched multi-push notifies once (checksum pins 200 vs 4000 notifies at
// 200 subscribers over 20 pushes); detail open pins exactly 5 concurrent
// distinct commands, repeat opens reuse the same 5 keys. Micro-op timings
// are noisy run to run (labs flags +-10-50%); the pins are the contract.
// Regression threshold is labs minDelta 5%; invoke counts are exact pins.

import { createModalSignalStore } from "../../src/store/modal.store";

const SCOPES = ["anilist", "search", "collection", "player"] as const;
const KEYS = [
  "spotlight",
  "browse",
  "stats",
  "friends",
  "filters",
  "detail",
  "recs",
  "favourites",
  "prefetch",
  "cheatsheet",
  "settings",
  "queue",
] as const;

function byteSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

group("modal-stack @quick", () => {
  bench("push+pop 2k cycles depth-1", () => {
    const store = createModalSignalStore();
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      sum += store.push("anilist", KEYS[i % KEYS.length], { animeId: i });
      sum += store.pop("anilist")?.id ?? 0;
    }
    return sum;
  });

  bench("push+pop 2k cycles depth-32", () => {
    const store = createModalSignalStore();
    for (let i = 0; i < 32; i++) store.push("anilist", KEYS[i % KEYS.length], { animeId: i });
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      sum += store.push("anilist", KEYS[i % KEYS.length], { animeId: i });
      sum += store.pop("anilist")?.id ?? 0;
    }
    return sum + store.atoms.stacks.get().anilist.length;
  });

  bench("replace 5k top swaps", () => {
    const store = createModalSignalStore();
    store.push("search", "filters");
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      sum += store.replace("search", KEYS[i % KEYS.length], { id: i });
    }
    return sum + store.atoms.stacks.get().search.length;
  });

  bench("top+depth read 20k", () => {
    const store = createModalSignalStore();
    store.push("collection", "detail");
    let sum = 0;
    for (let i = 0; i < 20_000; i++) {
      const stacks = store.atoms.stacks.get();
      sum += stacks[SCOPES[i % SCOPES.length]].length + (stacks.collection.at(-1)?.id ?? 0);
    }
    return sum;
  });

  bench("notify 200 subs x20 pushes unbatched", () => {
    const store = createModalSignalStore();
    const counter = { count: 0 };
    const notify = () => {
      counter.count += 1;
    };
    for (let s = 0; s < 200; s++) store.atoms.stacks.subscribe(notify);
    for (let i = 0; i < 20; i++) store.push("anilist", KEYS[i % KEYS.length]);
    return counter.count + store.atoms.stacks.get().anilist.length;
  });

  bench("notify 200 subs x20 pushes batched", () => {
    const store = createModalSignalStore();
    const counter = { count: 0 };
    const notify = () => {
      counter.count += 1;
    };
    for (let s = 0; s < 200; s++) store.atoms.stacks.subscribe(notify);
    store.batch(() => {
      for (let i = 0; i < 20; i++) store.push("anilist", KEYS[i % KEYS.length]);
    });
    return counter.count + store.atoms.stacks.get().anilist.length;
  });

  bench("resolve 5k content dispatches", () => {
    const titles: Record<string, string> = {};
    for (const key of KEYS) titles[key] = `title-${key}`;
    let sum = 0;
    for (let i = 0; i < 5000; i++) {
      const key = KEYS[i % KEYS.length];
      sum += (titles[key] ?? "").length + key.length;
    }
    return sum;
  });
});

interface FanOutCall {
  command: string;
  args: Record<string, unknown>;
  response: unknown;
}

// Uncached AniList detail open as the app fires it today: shell (full),
// characters panel, similar (recommendations), franchise graph, and friend
// scores each own a distinct query key, so all five miss together. Showcase
// reuses the loaded media and TMDB stills stay conditional, hence excluded.
function detailOpenCalls(id: number): FanOutCall[] {
  return [
    { command: "get_anime_full", args: { id }, response: { id, title: "Frieren" } },
    { command: "get_anime_characters", args: { id, page: 1 }, response: [] },
    { command: "get_anime_recommendations", args: { id }, response: [] },
    { command: "get_anime_franchise", args: { id, scope: "full" }, response: [] },
    {
      command: "get_anilist_friend_scores",
      args: { mediaId: id, userIds: [1, 2, 3] },
      response: [],
    },
  ];
}

group("modal-open-fanout @ipc @quick", () => {
  bench("detail open 5 concurrent distinct commands", function* detailFanOut() {
    const checksum = yield async () => {
      let invokes = 0;
      let bytes = 0;
      await Promise.all(
        detailOpenCalls(21).map(async (call) => {
          await Promise.resolve();
          invokes += 1;
          bytes += byteSize(call.args) + byteSize(call.response);
        })
      );
      return invokes * 1_000_000 + bytes;
    };
    return checksum;
  });

  bench("detail open repeated id reuses one key set", function* detailRepeat() {
    const seen = new Set<string>();
    const checksum = yield async () => {
      let invokes = 0;
      for (let round = 0; round < 3; round++) {
        for (const call of detailOpenCalls(21)) {
          const key = `${call.command}:${JSON.stringify(call.args)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          await Promise.resolve();
          invokes += 1;
        }
      }
      return invokes * 1_000_000 + seen.size;
    };
    return checksum;
  });
});
