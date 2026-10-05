import { describe, expect, it } from "vitest";

import { applyReactionToList } from "@/hooks/session/pin-react.hook";
import type { ReactionEntry, SessionReaction } from "@/types/session";

function frame(messageId: string, emoji: string, peerId: string, add: boolean): SessionReaction {
  return { add, emoji, messageId, peerId };
}

describe("applyReactionToList", () => {
  it("creates an entry when the message has no reactions yet", () => {
    expect(applyReactionToList([], frame("m1", "👍", "p1", true))).toEqual([
      { emoji: "👍", messageId: "m1", peers: ["p1"] },
    ]);
  });

  it("lets a second peer join the same entry", () => {
    const start: ReactionEntry[] = [{ emoji: "👍", messageId: "m1", peers: ["p1"] }];

    expect(applyReactionToList(start, frame("m1", "👍", "p2", true))).toEqual([
      { emoji: "👍", messageId: "m1", peers: ["p1", "p2"] },
    ]);
  });

  it("ignores a repeat add from a peer that already reacted", () => {
    const start: ReactionEntry[] = [{ emoji: "👍", messageId: "m1", peers: ["p1"] }];

    expect(applyReactionToList(start, frame("m1", "👍", "p1", true))).toBe(start);
  });

  it("keeps the other entries untouched when one entry changes", () => {
    const other: ReactionEntry = { emoji: "❤️", messageId: "m1", peers: ["p9"] };
    const start: ReactionEntry[] = [other, { emoji: "👍", messageId: "m1", peers: ["p1"] }];

    const next = applyReactionToList(start, frame("m1", "👍", "p2", true));

    expect(next[0]).toBe(other);
    expect(next[1]).toEqual({ emoji: "👍", messageId: "m1", peers: ["p1", "p2"] });
  });

  it("drops a peer but keeps the entry while peers remain", () => {
    const start: ReactionEntry[] = [{ emoji: "👍", messageId: "m1", peers: ["p1", "p2"] }];

    expect(applyReactionToList(start, frame("m1", "👍", "p1", false))).toEqual([
      { emoji: "👍", messageId: "m1", peers: ["p2"] },
    ]);
  });

  it("prunes the entry once its last peer leaves", () => {
    const start: ReactionEntry[] = [
      { emoji: "❤️", messageId: "m1", peers: ["p9"] },
      { emoji: "👍", messageId: "m1", peers: ["p1"] },
    ];

    expect(applyReactionToList(start, frame("m1", "👍", "p1", false))).toEqual([
      { emoji: "❤️", messageId: "m1", peers: ["p9"] },
    ]);
  });

  it("ignores a removal for an unknown message or emoji", () => {
    const start: ReactionEntry[] = [{ emoji: "👍", messageId: "m1", peers: ["p1"] }];

    expect(applyReactionToList(start, frame("m9", "👍", "p1", false))).toBe(start);
    expect(applyReactionToList(start, frame("m1", "❤️", "p1", false))).toBe(start);
    expect(applyReactionToList(start, frame("m1", "👍", "ghost", false))).toBe(start);
  });

  it("never mutates the input list", () => {
    const start: ReactionEntry[] = [{ emoji: "👍", messageId: "m1", peers: ["p1"] }];

    applyReactionToList(start, frame("m1", "👍", "p2", true));
    applyReactionToList(start, frame("m1", "👍", "p1", false));

    expect(start).toEqual([{ emoji: "👍", messageId: "m1", peers: ["p1"] }]);
  });
});
