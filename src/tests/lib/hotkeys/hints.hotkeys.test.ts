import { afterEach, describe, expect, it } from "vitest";

import { VIM_LABEL_ALPHABET } from "@/config/keyboard/vim.config";
import {
  assignLabels,
  badgeWidth,
  findBadge,
  hasLabelPrefix,
  hintLayoutsEqual,
  labelCapacity,
  labelLengthFor,
  measureBadgeLayouts,
  MIN_HINT_TARGET_PX,
  reduceHintKey,
  resolveBadgeCollisions,
  resolveHintDescription,
  scanHintTargets,
} from "@/lib/hotkeys/hints.hotkeys";
import type { HintBadge, HintBadgeLayout, HintVariant } from "@/lib/hotkeys/hints.hotkeys";
import type { TranslationKey } from "@/types/i18n";

const nodes: HTMLElement[] = [];

function box(node: HTMLElement, rect: Partial<DOMRect> = {}): HTMLElement {
  const full = {
    top: 10,
    left: 10,
    bottom: 30,
    right: 60,
    width: 50,
    height: 20,
    x: 10,
    y: 10,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  node.getBoundingClientRect = () => full;
  return node;
}

function el(tag = "button", rect: Partial<DOMRect> = {}): HTMLElement {
  const node = box(document.createElement(tag), rect);
  document.body.append(node);
  nodes.push(node);
  return node;
}

afterEach(() => {
  for (const node of nodes.splice(0)) node.remove();
});

function labels(badges: HintBadge[]): string[] {
  return badges.map((badge) => badge.label);
}

describe("assignLabels", () => {
  it("uses single characters while the run fits in the alphabet", () => {
    expect(assignLabels(3, "abc", 2)).toEqual(["a", "b", "c"]);
    expect(assignLabels(5, "abc", 2)).toEqual(["aa", "ab", "ac", "ba", "bb"]);
  });

  it("grows the whole run to two characters at once", () => {
    expect(assignLabels(4, "abc", 2)).toEqual(["aa", "ab", "ac", "ba"]);
    expect(assignLabels(4, "abc", 2).every((label) => label.length === 2)).toBe(true);
  });

  it("never mixes label lengths inside one run", () => {
    for (const count of [1, 2, 3, 4, 8, 9]) {
      const lengths = new Set(assignLabels(count, "abc", 2).map((label) => label.length));
      expect(lengths.size, `${count} targets`).toBe(1);
    }
  });

  it("returns nothing for an empty request or alphabet", () => {
    expect(assignLabels(0, "abc", 2)).toEqual([]);
    expect(assignLabels(3, "", 2)).toEqual([]);
  });

  it("picks the shortest tier that holds the run", () => {
    expect(labelLengthFor(3, 3, 2)).toBe(1);
    expect(labelLengthFor(4, 3, 2)).toBe(2);
    expect(labelLengthFor(9, 3, 2)).toBe(2);
    expect(labelLengthFor(10, 3, 2)).toBe(2);
  });

  it("reports the label space of the deepest allowed tier", () => {
    expect(labelCapacity("abc", 2)).toBe(9);
    expect(labelCapacity("abc", 1)).toBe(3);
    expect(labelCapacity("", 2)).toBe(0);
  });

  it("uses an alphabet without repeated characters", () => {
    expect(new Set(VIM_LABEL_ALPHABET).size).toBe(VIM_LABEL_ALPHABET.length);
    expect(labelCapacity(VIM_LABEL_ALPHABET, 2)).toBe(VIM_LABEL_ALPHABET.length ** 2);
  });
});

describe("scanHintTargets", () => {
  it("collects semantic and data-vim-target elements with unique labels", () => {
    const button = el("button");
    const anchor = el("a");
    const roleButton = el("div");
    roleButton.setAttribute("role", "button");
    const flagged = el("span");
    flagged.dataset.vimTarget = "";

    const { badges } = scanHintTargets(document.body, { alphabet: "abc", maxLabelLength: 2 });
    const found = badges.map((badge) => badge.element);
    expect(found).toContain(button);
    expect(found).toContain(anchor);
    expect(found).toContain(roleButton);
    expect(found).toContain(flagged);
    expect(found.every((_element, index) => badges[index]?.variant === "plain")).toBe(true);
    expect(new Set(labels(badges)).size).toBe(badges.length);
  });

  it("skips disabled, aria-disabled, sized-out, and data-vim-disabled subtrees", () => {
    const disabled = el("button");
    (disabled as HTMLButtonElement).disabled = true;
    const ariaDisabled = el("button");
    ariaDisabled.setAttribute("aria-disabled", "true");
    const collapsed = el("button", { width: 0, height: 0, right: 10, bottom: 10 });
    const hiddenRoot = document.createElement("div");
    hiddenRoot.dataset.vimDisabled = "";
    const hiddenChild = box(document.createElement("button"));
    hiddenRoot.append(hiddenChild);
    document.body.append(hiddenRoot);
    nodes.push(hiddenRoot);

    const { badges } = scanHintTargets(document.body);
    const found = badges.map((badge) => badge.element);
    expect(found).not.toContain(disabled);
    expect(found).not.toContain(ariaDisabled);
    expect(found).not.toContain(collapsed);
    expect(found).not.toContain(hiddenChild);
  });

  it("skips visually hidden 1x1 controls parked at the origin", () => {
    const hidden = el("input", { top: 0, left: 0, right: 1, bottom: 1, width: 1, height: 1 });
    hidden.setAttribute("type", "checkbox");
    hidden.setAttribute("aria-hidden", "true");
    hidden.tabIndex = -1;
    const subFloor = el("button", {
      top: 40,
      left: 40,
      right: 44,
      bottom: 44,
      width: 4,
      height: 4,
    });
    const atFloor = el("button", {
      top: 60,
      left: 60,
      right: 60 + MIN_HINT_TARGET_PX,
      bottom: 60 + MIN_HINT_TARGET_PX,
      width: MIN_HINT_TARGET_PX,
      height: MIN_HINT_TARGET_PX,
    });

    const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
    expect(found).not.toContain(hidden);
    expect(found).not.toContain(subFloor);
    expect(found).toContain(atFloor);
  });

  it("skips targets clipped by their own scroll container", () => {
    const pane = box(document.createElement("div"), {
      top: 200,
      bottom: 400,
      left: 0,
      right: 400,
      width: 400,
      height: 200,
    });
    pane.style.overflow = "hidden";
    const above = box(document.createElement("button"), {
      top: 150,
      left: 20,
      bottom: 170,
      right: 120,
      width: 100,
      height: 20,
    });
    const inside = box(document.createElement("button"), {
      top: 250,
      left: 20,
      bottom: 270,
      right: 120,
      width: 100,
      height: 20,
    });
    pane.append(above, inside);
    document.body.append(pane);
    nodes.push(pane);

    const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
    expect(found).not.toContain(above);
    expect(found).toContain(inside);
  });

  it("drops an absolute target outside a static overflow container", () => {
    const pane = box(document.createElement("div"), {
      top: 400,
      bottom: 500,
      left: 0,
      right: 200,
      width: 200,
      height: 100,
    });
    pane.style.overflow = "hidden";
    const floating = box(document.createElement("button"), {
      top: 600,
      left: 20,
      bottom: 620,
      right: 120,
      width: 100,
      height: 20,
    });
    floating.style.position = "absolute";
    pane.append(floating);
    document.body.append(pane);
    nodes.push(pane);

    const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
    expect(found).not.toContain(floating);
  });

  it("keeps an absolute target inside a static overflow container", () => {
    const pane = box(document.createElement("div"), {
      top: 400,
      bottom: 500,
      left: 0,
      right: 200,
      width: 200,
      height: 100,
    });
    pane.style.overflow = "hidden";
    const floating = box(document.createElement("button"), {
      top: 420,
      left: 20,
      bottom: 440,
      right: 120,
      width: 100,
      height: 20,
    });
    floating.style.position = "absolute";
    pane.append(floating);
    document.body.append(pane);
    nodes.push(pane);

    const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
    expect(found).toContain(floating);
  });

  it("keeps a fixed target outside any container", () => {
    const pane = box(document.createElement("div"), {
      top: 400,
      bottom: 500,
      left: 0,
      right: 200,
      width: 200,
      height: 100,
    });
    pane.style.overflow = "hidden";
    const popup = box(document.createElement("button"), {
      top: 600,
      left: 20,
      bottom: 620,
      right: 120,
      width: 100,
      height: 20,
    });
    popup.style.position = "fixed";
    pane.append(popup);
    document.body.append(pane);
    nodes.push(pane);

    const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
    expect(found).toContain(popup);
  });

  it("skips a target painted under sticky chrome", () => {
    const covered = el("button", {
      top: 40,
      left: 40,
      bottom: 60,
      right: 100,
      width: 60,
      height: 20,
    });
    const visible = el("button", {
      top: 80,
      left: 40,
      bottom: 100,
      right: 100,
      width: 60,
      height: 20,
    });
    const scrim = el("div", { top: 0, left: 0, bottom: 70, right: 300, width: 300, height: 70 });
    scrim.className = "sticky";
    const original = document.elementFromPoint;
    document.elementFromPoint = ((_x: number, y: number) =>
      y < 70 ? scrim : visible) as typeof document.elementFromPoint;
    try {
      const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
      expect(found).not.toContain(covered);
      expect(found).toContain(visible);
    } finally {
      document.elementFromPoint = original;
    }
  });

  it("labels the marked content region before the chrome", () => {
    const chrome = el("button", {
      top: 10,
      left: 10,
      bottom: 30,
      right: 60,
      width: 50,
      height: 20,
    });
    const panel = document.createElement("div");
    panel.dataset.scrollRoot = "";
    const firstCard = box(document.createElement("button"), {
      top: 100,
      left: 10,
      bottom: 120,
      right: 60,
      width: 50,
      height: 20,
    });
    const secondCard = box(document.createElement("button"), {
      top: 140,
      left: 10,
      bottom: 160,
      right: 60,
      width: 50,
      height: 20,
    });
    panel.append(firstCard, secondCard);
    document.body.append(panel);
    nodes.push(panel);

    const { badges } = scanHintTargets(document.body, { alphabet: "abc", maxLabelLength: 2 });
    expect(badges.map((badge) => badge.element)).toEqual([firstCard, secondCard, chrome]);
    expect(badges.map((badge) => badge.label)).toEqual(["a", "b", "c"]);
  });

  it("keeps pure DOM order without a content marker", () => {
    const first = el("button", {
      top: 200,
      left: 10,
      bottom: 220,
      right: 60,
      width: 50,
      height: 20,
    });
    const second = el("button", {
      top: 10,
      left: 10,
      bottom: 30,
      right: 60,
      width: 50,
      height: 20,
    });
    const { badges } = scanHintTargets(document.body);
    expect(badges[0]?.element).toBe(first);
    expect(badges[1]?.element).toBe(second);
  });

  it("keeps only viewport-visible elements", () => {
    const visible = el("button");
    const above = el("button", { top: -50, bottom: -10 });
    const below = el("button", { top: 5000, bottom: 5020 });

    const found = scanHintTargets(document.body).badges.map((badge) => badge.element);
    expect(found).toContain(visible);
    expect(found).not.toContain(above);
    expect(found).not.toContain(below);
  });

  it("adds one suffix badge per modifier variant", () => {
    const plain = el("button");
    const context = el("button");
    context.dataset.vimContextmenu = "";
    const both = el("button");
    both.dataset.vimContextmenu = "";
    both.dataset.vimCtrlclick = "";

    const { badges } = scanHintTargets(document.body);
    const of = (element: HTMLElement): HintBadge[] =>
      badges.filter((badge) => badge.element === element);
    expect(of(plain).map((badge) => badge.variant)).toEqual(["plain"]);
    expect(of(context).map((badge) => badge.variant)).toEqual(["plain", "contextmenu"]);
    expect(of(both).map((badge) => badge.variant)).toEqual(["plain", "ctrl", "contextmenu"]);
    expect(new Set(labels(badges)).size).toBe(badges.length);
  });

  it("caps the badge list and reports the dropped elements", () => {
    for (let i = 0; i < 4; i += 1) el("button");
    const { badges, overflow } = scanHintTargets(document.body, { max: 2 });
    expect(badges).toHaveLength(2);
    expect(overflow).toBe(2);
  });

  it("never emits an empty label when the label space runs out", () => {
    for (let i = 0; i < 5; i += 1) el("button");
    const { badges, overflow } = scanHintTargets(document.body, {
      max: 1000,
      alphabet: "ab",
      maxLabelLength: 1,
    });
    expect(badges.map((badge) => badge.label)).toEqual(["a", "b"]);
    expect(overflow).toBe(3);
  });

  it("keeps labels non-empty for a dense surface past the alphabet capacity", () => {
    for (let i = 0; i < 400; i += 1) el("button");
    const { badges, overflow } = scanHintTargets(document.body, { max: 3000 });
    const capacity = VIM_LABEL_ALPHABET.length ** 2;
    expect(badges.length).toBe(capacity);
    expect(overflow).toBe(400 - capacity);
    expect(badges.every((badge) => badge.label.length === 2)).toBe(true);
    expect(new Set(labels(badges)).size).toBe(badges.length);
  });

  it("hands editable targets a focus badge and keeps control inputs on click", () => {
    const text = el("input") as HTMLInputElement;
    text.type = "text";
    const area = el("textarea");
    const dropdown = el("select");
    const rich = el("div");
    rich.setAttribute("contenteditable", "true");
    const check = el("input") as HTMLInputElement;
    check.type = "checkbox";
    const hidden = el("input") as HTMLInputElement;
    hidden.type = "hidden";

    const { badges } = scanHintTargets(document.body, {
      alphabet: "abcdefg",
      maxLabelLength: 2,
    });
    const of = (element: HTMLElement): HintVariant[] =>
      badges.filter((badge) => badge.element === element).map((badge) => badge.variant);
    expect(of(text)).toEqual(["focus"]);
    expect(of(area)).toEqual(["focus"]);
    expect(of(dropdown)).toEqual(["focus"]);
    expect(of(rich)).toEqual(["focus"]);
    expect(of(check)).toEqual(["plain"]);
    expect(of(hidden)).toEqual([]);
    expect(new Set(labels(badges)).size).toBe(badges.length);
  });
});

describe("resolveBadgeCollisions", () => {
  function layout(
    label: string,
    left: number,
    top = 10,
    pinned = false,
    description = "",
    variant: HintVariant = "plain"
  ): HintBadgeLayout {
    return { label, variant, description, pinned, top, left };
  }

  it("returns the run untouched without overlap", () => {
    const layouts = [layout("f", 10), layout("j", 40)];
    expect(resolveBadgeCollisions(layouts)).toEqual(layouts);
  });

  it("leaves a pin without a description alone", () => {
    const layouts = [layout("f", 10, 10, true), layout("j", 40)];
    expect(resolveBadgeCollisions(layouts)).toEqual(layouts);
  });

  it("shifts an intersecting neighbor to the pin edge", () => {
    const pin = layout("f", 10, 10, true, "Do it");
    const right = 10 + badgeWidth(pin);
    expect(right).toBeGreaterThan(40);
    const layouts = [pin, layout("j", 40), layout("k", 500), layout("d", 40, 100)];
    const resolved = resolveBadgeCollisions(layouts);
    expect(resolved[1]?.left).toBe(right);
    expect(resolved[2]?.left).toBe(500);
    expect(resolved[3]?.left).toBe(40);
    expect(resolved[0]?.left).toBe(10);
  });

  it("shifts compact badges overlapping each other", () => {
    const minus = layout("df", 10);
    const plus = layout("dj", 26);
    const right = 10 + badgeWidth(minus);
    expect(26).toBeLessThan(right);
    const resolved = resolveBadgeCollisions([minus, plus]);
    expect(resolved[0]?.left).toBe(10);
    expect(resolved[1]?.left).toBe(right);
  });

  it("keeps stacked variant suffixes in place", () => {
    const layouts = [layout("f", 10), layout("j", 34, 10, false, "", "ctrl")];
    expect(resolveBadgeCollisions(layouts)).toEqual(layouts);
  });

  it("cascades through stacked neighbors and stays idempotent", () => {
    const pin = layout("f", 10, 10, true, "Do it");
    const right = 10 + badgeWidth(pin);
    const layouts = [pin, layout("j", 40), layout("k", 55)];
    const once = resolveBadgeCollisions(layouts);
    expect(once[1]?.left).toBe(right);
    expect(once[2]?.left).toBe(right + badgeWidth(once[1]!));
    expect(resolveBadgeCollisions(once)).toEqual(once);
  });

  it("drops badges whose element left the document", () => {
    const ghost = document.createElement("button");
    const badges: HintBadge[] = [{ element: ghost, label: "f", variant: "plain" }];
    const translate = (key: TranslationKey): string => `t:${key}`;
    expect(measureBadgeLayouts(badges, null, translate)).toEqual([]);
  });
});

describe("label matching", () => {
  const badges: HintBadge[] = [
    { element: {} as HTMLElement, label: "f", variant: "plain" },
    { element: {} as HTMLElement, label: "fj", variant: "ctrl" },
  ];

  it("finds a complete label", () => {
    expect(findBadge(badges, "fj")?.variant).toBe("ctrl");
    expect(findBadge(badges, "x")).toBeUndefined();
  });

  it("reports labels that are still a prefix of a longer label", () => {
    expect(hasLabelPrefix(badges, "f")).toBe(true);
    expect(hasLabelPrefix(badges, "z")).toBe(false);
  });
});

describe("measureBadgeLayouts", () => {
  const translate = (key: TranslationKey): string => `t:${key}`;

  it("measures rects and offsets badges that share one element", () => {
    const element = el("button", { top: 100, left: 200 });
    const badges: HintBadge[] = [
      { element, label: "f", variant: "plain" },
      { element, label: "j", variant: "ctrl" },
    ];
    const layouts = measureBadgeLayouts(badges, null, translate);
    expect(layouts[0]?.top).toBe(100);
    expect(layouts[0]?.left).toBe(200);
    expect(layouts[1]?.left).toBe(224);
    expect(layouts.map((layout) => layout.pinned)).toEqual([false, false]);
  });

  it("resolves the description only for the pinned label", () => {
    const element = el("button");
    element.textContent = "Play";
    const badges: HintBadge[] = [
      { element, label: "f", variant: "plain" },
      { element, label: "j", variant: "plain" },
    ];
    const layouts = measureBadgeLayouts(badges, "j", translate);
    expect(layouts[0]?.description).toBe("");
    expect(layouts[1]?.pinned).toBe(true);
    expect(layouts[1]?.description).toBe("Play");
  });

  it("drops badges whose element hid after the scan", () => {
    const element = el("button", { width: 0, height: 0, top: 0, left: 0 });
    const badges: HintBadge[] = [{ element, label: "f", variant: "plain" }];
    expect(measureBadgeLayouts(badges, null, translate)).toEqual([]);
  });

  it("drops badges whose element shrank to the visually hidden box", () => {
    const element = el("input", { width: 1, height: 1, top: 0, left: 0, right: 1, bottom: 1 });
    const badges: HintBadge[] = [{ element, label: "f", variant: "plain" }];
    expect(measureBadgeLayouts(badges, null, translate)).toEqual([]);
  });

  it("drops badges whose element reports unrendered without a zero rect", () => {
    const element = el("button", { width: 50, height: 20, top: 0, left: 0 });
    (element as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility = () => false;
    const badges: HintBadge[] = [{ element, label: "f", variant: "plain" }];
    expect(measureBadgeLayouts(badges, null, translate)).toEqual([]);
  });

  it("keeps badges when the visibility probe is missing or throws", () => {
    const element = el("button", { width: 50, height: 20, top: 0, left: 0 });
    (element as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility = () => {
      throw new Error("no layout engine");
    };
    const badges: HintBadge[] = [{ element, label: "f", variant: "plain" }];
    expect(measureBadgeLayouts(badges, null, translate)).toHaveLength(1);
  });

  it("keeps badges whose element is still visible", () => {
    const element = el("button", { width: 50, height: 20, top: 0, left: 0 });
    const badges: HintBadge[] = [{ element, label: "f", variant: "plain" }];
    expect(measureBadgeLayouts(badges, null, translate)).toHaveLength(1);
  });
});

describe("hintLayoutsEqual", () => {
  const base = [
    { label: "f", variant: "plain" as const, description: "", pinned: false, top: 1, left: 2 },
  ];

  it("compares by value", () => {
    expect(hintLayoutsEqual(base, [...base])).toBe(true);
    expect(hintLayoutsEqual(base, [])).toBe(false);
    expect(hintLayoutsEqual(base, [{ ...base[0], top: 9 }])).toBe(false);
  });
});

describe("reduceHintKey", () => {
  const ambiguous: HintBadge[] = [
    { element: {} as HTMLElement, label: "f", variant: "plain" },
    { element: {} as HTMLElement, label: "fj", variant: "ctrl" },
  ];
  const unambiguous: HintBadge[] = [
    { element: {} as HTMLElement, label: "f", variant: "plain" },
    { element: {} as HTMLElement, label: "j", variant: "plain" },
  ];

  it("activates on a complete label with no longer sibling", () => {
    const result = reduceHintKey(unambiguous, "", "f", false);
    expect(result.outcome).toBe("activate");
    expect(result.badge?.label).toBe("f");
    expect(result.buffer).toBe("");
  });

  it("waits instead of firing a label that is another label's prefix", () => {
    const first = reduceHintKey(ambiguous, "", "f", false);
    expect(first.outcome).toBe("buffer");
    expect(first.buffer).toBe("f");
    expect(first.badge).toBeUndefined();

    const second = reduceHintKey(ambiguous, "f", "j", false);
    expect(second.outcome).toBe("activate");
    expect(second.badge?.label).toBe("fj");
  });

  it("pins instead of activating while Alt is held", () => {
    const result = reduceHintKey(unambiguous, "", "f", true);
    expect(result.outcome).toBe("pin");
    expect(result.badge?.label).toBe("f");
    expect(result.buffer).toBe("");
  });

  it("never pins an ambiguous prefix either", () => {
    const result = reduceHintKey(ambiguous, "", "f", true);
    expect(result.outcome).toBe("buffer");
    expect(result.buffer).toBe("f");
  });

  it("extends the buffer while the input is still a prefix", () => {
    const pairBadges: HintBadge[] = [{ element: {} as HTMLElement, label: "ab", variant: "plain" }];
    const partial = reduceHintKey(pairBadges, "", "a", false);
    expect(partial.outcome).toBe("buffer");
    expect(partial.buffer).toBe("a");
    const complete = reduceHintKey(pairBadges, "a", "b", false);
    expect(complete.outcome).toBe("activate");
  });

  it("restarts from the last keystroke on a dead end", () => {
    const restarted = reduceHintKey(ambiguous, "f", "j", false);
    expect(restarted.outcome).toBe("activate");

    const deadEnd = reduceHintKey(unambiguous, "f", "z", false);
    expect(deadEnd.outcome).toBe("clear");
    expect(deadEnd.buffer).toBe("");
  });

  it("clears a wrong label", () => {
    const result = reduceHintKey(ambiguous, "f", "z", false);
    expect(result.outcome).toBe("clear");
    expect(result.buffer).toBe("");
  });
});

describe("resolveHintDescription", () => {
  const translate = (key: TranslationKey): string => `t:${key}`;

  it("translates a data-vim-label key first", () => {
    const node = el("button");
    node.dataset.vimLabel = "keybind.vim.hints";
    node.textContent = "ignored";
    expect(resolveHintDescription(node, translate)).toBe("t:keybind.vim.hints");
  });

  it("falls back to aria-label then collapsed text", () => {
    const aria = el("button");
    aria.setAttribute("aria-label", "Play");
    expect(resolveHintDescription(aria, translate)).toBe("Play");

    const text = el("button");
    text.textContent = "  Open   folder  ";
    expect(resolveHintDescription(text, translate)).toBe("Open folder");
  });

  it("returns an empty string when nothing describes the target", () => {
    expect(resolveHintDescription(el("button"), translate)).toBe("");
  });
});
