import {
  VIM_CONTENT_SELECTOR,
  VIM_DISABLED_ATTRIBUTE,
  VIM_HINT_ATTRIBUTES,
  VIM_LABEL_ALPHABET,
  VIM_MAX_LABEL_LENGTH,
} from "@/config/keyboard/vim.config";
import { resolveRowCollisions } from "@/lib/collision/resolve.collision";
import type { TranslationKey } from "@/types/i18n";

export type HintVariant = "plain" | "ctrl" | "contextmenu" | "focus";

/** One badge = one typed label = one synthesized action. */
export interface HintBadge {
  element: HTMLElement;
  label: string;
  variant: HintVariant;
}

export interface HintScanResult {
  badges: HintBadge[];
  /** Hintable, in-viewport elements dropped past the cap. */
  overflow: number;
}

export interface HintScanOptions {
  max?: number;
  alphabet?: string;
  maxLabelLength?: number;
}

const FOCUS_SELECTOR = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]';
const SCANNER_SELECTOR = `button, a, [role="button"], [data-vim-target], ${FOCUS_SELECTOR}`;

// Every label of exactly `length` characters, in alphabet order.
function* labelStream(alphabet: string, length: number): Generator<string> {
  const indices: number[] = [];
  for (let i = 0; i < length; i += 1) indices.push(0);
  for (;;) {
    yield indices.map((index) => alphabet[index]).join("");
    let pos = length - 1;
    while (pos >= 0) {
      indices[pos] += 1;
      if (indices[pos] < alphabet.length) break;
      indices[pos] = 0;
      pos -= 1;
    }
    if (pos < 0) break;
  }
}

/**
 * Label length for a whole run, vimium-c style: each run uses one uniform
 * length, which only grows when the shorter tier cannot hold every target.
 * Mixed lengths would make the short labels unreachable - a label that is also
 * the prefix of a longer one can never be typed to completion, the longer
 * label always wins the keystroke.
 */
export function labelLengthFor(
  count: number,
  alphabetLength: number,
  maxLabelLength: number
): number {
  let length = 1;
  while (length < maxLabelLength && alphabetLength ** length < count) length += 1;
  return length;
}

/** Targets the deepest allowed tier can label. */
export function labelCapacity(alphabet: string, maxLabelLength: number): number {
  if (alphabet.length === 0 || maxLabelLength <= 0) return 0;
  return alphabet.length ** maxLabelLength;
}

export function assignLabels(count: number, alphabet: string, maxLabelLength: number): string[] {
  const labels: string[] = [];
  if (count <= 0 || alphabet.length === 0) return labels;
  const length = labelLengthFor(count, alphabet.length, maxLabelLength);
  for (const label of labelStream(alphabet, length)) {
    labels.push(label);
    if (labels.length >= count) break;
  }
  return labels;
}

/**
 * Smallest box a target may have and still be hinted. Base UI renders one
 * visually hidden form control per checkbox and per select - `position:
 * fixed; width: 1px; height: 1px; clip-path: inset(50%)`, parked at the
 * origin. That rect is non-zero and `checkVisibility` calls it visible, so a
 * size floor is the only thing standing between those inputs and a badge
 * pinned to the top-left corner of the window (one per checkbox, all stacked
 * by the collision shift). The tightest hit areas in the app are the 8-10px
 * crop handles and icon buttons (`size-2`/`size-2.5`), so an inclusive 8px
 * floor keeps every real control and rejects the 1px fake.
 */
export const MIN_HINT_TARGET_PX = 8;

function isVisible(rect: DOMRect): boolean {
  return rect.width >= MIN_HINT_TARGET_PX && rect.height >= MIN_HINT_TARGET_PX;
}

/**
 * Rendered right now, not just laid out: `visibility:hidden`, zero
 * opacity, and skipped `content-visibility` subtrees keep their rects but
 * must not carry badges. Runs before the rect read so hidden subtrees
 * skip layout work too. Unknown environments (jsdom) stay on the rect
 * path instead of dropping every badge.
 */
function isRendered(element: HTMLElement): boolean {
  const check = (
    element as HTMLElement & {
      checkVisibility?: (options?: {
        checkOpacity?: boolean;
        checkVisibilityCSS?: boolean;
      }) => boolean;
    }
  ).checkVisibility;
  if (typeof check !== "function") return true;
  try {
    return check.call(element, { checkOpacity: true, checkVisibilityCSS: true });
  } catch {
    return true;
  }
}

function isInViewport(rect: DOMRect): boolean {
  const width = typeof window === "undefined" ? 0 : window.innerWidth;
  const height = typeof window === "undefined" ? 0 : window.innerHeight;
  return rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width;
}

function isHintable(element: HTMLElement, rect: DOMRect): boolean {
  if (element.closest(`[${VIM_DISABLED_ATTRIBUTE}]`)) return false;
  if (element.matches(":disabled")) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  return isVisible(rect);
}

interface ClipAncestor {
  /** The ancestor's box, or null when it does not clip at all. */
  box: DOMRect | null;
}

/**
 * Clipping ancestry. A target scrolled out of its own scroll container keeps a
 * rect that can still sit inside the window - containers rarely span the whole
 * window - so the viewport test alone would hand it a label and draw its badge
 * over whatever happens to be there. Ancestor boxes are memoised for the
 * duration of one scan (nothing scrolls during it), so `getComputedStyle` runs
 * once per container instead of once per candidate. The window itself is
 * already the viewport test's job, which is why `body`/`html` are not walked.
 */
function makeClipTest(): (element: HTMLElement, rect: DOMRect) => boolean {
  const ancestors = new Map<Element, ClipAncestor>();
  return (element, rect) => {
    // Resolved once, and only for candidates outside a clipping box: a
    // `getComputedStyle` per candidate measured 0.16 ms per 78 candidates for
    // a value most candidates never need.
    let elementPosition: string | null = null;
    for (
      let node = element.parentElement;
      node && node !== document.body && node !== document.documentElement;
      node = node.parentElement
    ) {
      let entry = ancestors.get(node);
      if (entry === undefined) {
        // A node whose content fits cannot clip anything, so the style
        // resolution that answers "does this clip?" is paid only for nodes
        // that actually overflow. Positioned children do not count towards
        // `scrollHeight`, so this stays conservative: it can miss a clip, it
        // cannot invent one. A node with no metrics at all (jsdom, or a box
        // that is not laid out yet) keeps the style path rather than being
        // written off as a non-clipper.
        const laidOut = node.clientHeight > 0 || node.clientWidth > 0;
        const overflows =
          !laidOut ||
          node.scrollHeight > node.clientHeight + 1 ||
          node.scrollWidth > node.clientWidth + 1;
        const style = overflows ? getComputedStyle(node) : null;
        const clips =
          style !== null &&
          /(hidden|clip|auto|scroll)/u.test(
            `${style.overflow}${style.overflowX}${style.overflowY}`
          );
        entry = { box: clips ? node.getBoundingClientRect() : null };
        ancestors.set(node, entry);
      }
      const box = entry.box;
      if (!box) continue;
      const outside =
        rect.bottom <= box.top ||
        rect.top >= box.bottom ||
        rect.right <= box.left ||
        rect.left >= box.right;
      if (!outside) continue;
      // An ancestor with clipping overflow clips absolute descendants too -
      // only `position: fixed` escapes to the viewport (popovers, menus), and
      // transformed ancestors that would re-anchor fixed boxes do not exist in
      // this chrome.
      if (elementPosition === null) elementPosition = getComputedStyle(element).position;
      if (elementPosition !== "fixed") return true;
    }
    return false;
  };
}

/**
 * Sticky chrome inside a scroll panel - a table head, a settings sub-header -
 * paints over the content that scrolls under it, and the badge layer paints
 * over the sticky chrome in turn, so a badge there would point at a control the
 * user cannot see. Hit-testing every candidate is what that insight costs by
 * default: 1.45 ms for 64 candidates on the real app (~23 us each, ~70 ms for a
 * 3000-target screen). Sticky boxes are cheap to collect and describe exactly
 * the region where the test can matter, so only candidates inside one are
 * tested.
 */
function collectStickyBoxes(root: ParentNode): DOMRect[] {
  const boxes: DOMRect[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('[class~="sticky"]')) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) boxes.push(rect);
  }
  return boxes;
}

/**
 * A target whose own centre resolves to a different element is painted under
 * it: a sticky header, a scrim, a closed panel's leftovers. Only fully
 * in-window boxes are tested - for a partially visible target the centre can
 * legitimately fall outside the window or outside its container, and a miss
 * there would drop a target the user can actually see. Environments without a
 * hit test (jsdom) keep the candidate.
 */
function isCovered(element: HTMLElement, rect: DOMRect, sticky: readonly DOMRect[]): boolean {
  const hitTest = document.elementFromPoint;
  if (typeof hitTest !== "function") return false;
  if (
    rect.top < 0 ||
    rect.left < 0 ||
    rect.bottom > window.innerHeight ||
    rect.right > window.innerWidth
  ) {
    return false;
  }
  const nearSticky = sticky.some(
    (box) => rect.top < box.bottom && box.top < rect.bottom && rect.left < box.right && box.left < rect.right
  );
  if (!nearSticky) return false;
  const hit = hitTest.call(document, rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (hit === null) return false;
  return hit !== element && !element.contains(hit);
}

const FOCUS_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

function variantsFor(element: HTMLElement): HintVariant[] {
  if (isFocusTarget(element)) return ["focus"];
  const variants: HintVariant[] = ["plain"];
  if (element.hasAttribute(VIM_HINT_ATTRIBUTES.ctrlClick)) variants.push("ctrl");
  if (element.hasAttribute(VIM_HINT_ATTRIBUTES.contextMenu)) variants.push("contextmenu");
  return variants;
}

/**
 * Editable targets take a focus badge instead of a click: typing into them
 * is the action, and a synthetic click would be wrong (checkboxes and other
 * control inputs keep the click path on purpose).
 */
function isFocusTarget(element: HTMLElement): boolean {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLSelectElement) return true;
  if (element.matches('[contenteditable="true"]')) return true;
  if (element instanceof HTMLInputElement) {
    return FOCUS_INPUT_TYPES.has(element.type);
  }
  return false;
}

export function scanHintTargets(
  root: ParentNode = document,
  options: HintScanOptions = {}
): HintScanResult {
  const alphabet = options.alphabet ?? VIM_LABEL_ALPHABET;
  const maxLabelLength = options.maxLabelLength ?? VIM_MAX_LABEL_LENGTH;
  // The label space is the only ceiling: a 19-letter alphabet with uniform
  // 2-char labels holds 361, so anything past the capacity is reported as
  // overflow instead of being handed an empty label.
  const max = Math.min(
    options.max ?? Number.POSITIVE_INFINITY,
    labelCapacity(alphabet, maxLabelLength)
  );
  const contentRoots = root.querySelectorAll<HTMLElement>(VIM_CONTENT_SELECTOR);
  const stickyBoxes = collectStickyBoxes(root);
  const isClipped = makeClipTest();
  const collected: { element: HTMLElement; rect: DOMRect; variants: HintVariant[] }[] = [];
  let overflow = 0;
  let badgeCount = 0;

  for (const element of root.querySelectorAll<HTMLElement>(SCANNER_SELECTOR)) {
    // One rect read per candidate: it feeds the size floor, the viewport test,
    // the region ranking and the cover test.
    const rect = element.getBoundingClientRect();
    if (!isVisible(rect) || !isInViewport(rect)) continue;
    if (!isHintable(element, rect)) continue;
    if (isClipped(element, rect) || isCovered(element, rect, stickyBoxes)) continue;
    const variants = variantsFor(element);
    if (badgeCount + variants.length > max) {
      overflow += 1;
      continue;
    }
    collected.push({ element, rect, variants });
    badgeCount += variants.length;
  }

  // Region ranking: labels start at the surface the route marks as its content
  // and only then move to the chrome. The run is handed out in scan order with
  // one uniform length, so with DOM order the tab bar, the toolbar and a status
  // filter row can eat the short tier before a single card is labelled - on a
  // measured 12-item collection screen the first card got its label at scan
  // position 23, which put every card in the second tier. Neither the grammar
  // nor the length rule changes: only who is asked first. A root without a
  // content marker (a dialog, a menu) keeps pure DOM order, and the sort is
  // stable, so candidates of one region keep their DOM order and the rects
  // already read above are reused instead of re-measured.
  if (contentRoots.length > 0) {
    const rank = (element: HTMLElement): number => {
      for (const contentRoot of contentRoots) {
        if (contentRoot.contains(element)) return 0;
      }
      return 1;
    };
    collected.sort(
      (a, b) => rank(a.element) - rank(b.element) || a.rect.top - b.rect.top || a.rect.left - b.rect.left
    );
  }

  const labels = assignLabels(badgeCount, alphabet, maxLabelLength);
  const badges: HintBadge[] = [];
  let cursor = 0;
  for (const { element, variants } of collected) {
    for (const variant of variants) {
      badges.push({ element, label: labels[cursor] ?? "", variant });
      cursor += 1;
    }
  }
  return { badges, overflow };
}

export function findBadge(badges: readonly HintBadge[], label: string): HintBadge | undefined {
  return badges.find((badge) => badge.label === label);
}

export function hasLabelPrefix(badges: readonly HintBadge[], buffer: string): boolean {
  return badges.some((badge) => badge.label.startsWith(buffer));
}

/** One rendered badge; produced on every measure (scroll/resize/mutation). */
export interface HintBadgeLayout {
  label: string;
  variant: HintVariant;
  description: string;
  pinned: boolean;
  top: number;
  left: number;
}

export const HINT_BADGE_OFFSET = 24;

/** Rough glyph advance for the 11px bold badge text; widths are estimates. */
export const BADGE_CHAR_PX = 7;
/** Mirrors the `max-w-64` cap on the grown badge. */
export const PINNED_BADGE_MAX_PX = 256;
const BADGE_PADDING_PX = 8;
/** Suffix icons (`size-2.5` plus the flex gap). */
const BADGE_ICON_PX = 12;
/** Badges within one row height count as intersecting. */
const BADGE_ROW_PX = 20;
const MAX_COLLISION_PASSES = 5;

export function badgeWidth(layout: HintBadgeLayout): number {
  const grown = layout.pinned && layout.description.length > 0;
  const chars = grown ? layout.label.length + layout.description.length : layout.label.length;
  const text = grown ? Math.min(PINNED_BADGE_MAX_PX, chars * BADGE_CHAR_PX) : chars * BADGE_CHAR_PX;
  return text + BADGE_PADDING_PX + (layout.variant === "plain" ? 0 : BADGE_ICON_PX);
}

/**
 * Shifts badges hidden under another badge to its right edge, in row-major
 * order. Pure estimate (no DOM read): widths are approximated, so the overlay
 * additionally stacks a pinned badge above. A grown pin anchors: it never
 * moves, everything intersecting it moves instead. Idempotent - a resolved
 * run resolves to itself, so remeasures converge instead of drifting.
 */
export function resolveBadgeCollisions(layouts: readonly HintBadgeLayout[]): HintBadgeLayout[] {
  const boxes = layouts.map((item) => ({
    minX: item.left,
    minY: item.top,
    maxX: item.left + badgeWidth(item),
    maxY: item.top,
  }));
  const { left } = resolveRowCollisions(boxes, {
    rowGap: BADGE_ROW_PX,
    maxPasses: MAX_COLLISION_PASSES,
    anchored: (index) => {
      const item = layouts[index];
      return item !== undefined && item.pinned && item.description.length > 0;
    },
  });
  return layouts.map((item, index) => ({ ...item, left: left[index] ?? item.left }));
}

export function measureBadgeLayouts(
  badges: readonly HintBadge[],
  pinned: string | null,
  translate: (key: TranslationKey) => string,
  offset: number = HINT_BADGE_OFFSET
): HintBadgeLayout[] {
  const seen = new Map<HTMLElement, number>();
  const layouts: HintBadgeLayout[] = [];
  for (const badge of badges) {
    // The layer outlives route switches: detached nodes would pile at 0,0.
    if (!badge.element.isConnected) continue;
    // ...and outlives hiding: a scanned control can hide afterwards (a
    // closed menu, dropdown, or panel). `checkVisibility` runs first so
    // hidden subtrees skip the rect read entirely; it covers
    // `visibility:hidden`, zero opacity, and skipped `content-visibility`
    // subtrees that still report a non-zero rect. The jsdom guard keeps
    // unit tests on the rect path.
    if (!isRendered(badge.element)) continue;
    const rect = badge.element.getBoundingClientRect();
    // A fully collapsed element reports a zero rect, and a control that
    // shrank to the visually hidden 1x1 box after the scan reports one below
    // the floor: without this its badges collapse to the origin, stack by the
    // variant offset, and cascade into a ghost row at the top.
    if (rect.width < MIN_HINT_TARGET_PX || rect.height < MIN_HINT_TARGET_PX) continue;
    const index = seen.get(badge.element) ?? 0;
    seen.set(badge.element, index + 1);
    const isPinned = pinned !== null && pinned === badge.label;
    layouts.push({
      label: badge.label,
      variant: badge.variant,
      pinned: isPinned,
      description: isPinned ? resolveHintDescription(badge.element, translate) : "",
      top: rect.top,
      left: rect.left + index * offset,
    });
  }
  return layouts;
}

export function hintLayoutsEqual(
  a: readonly HintBadgeLayout[],
  b: readonly HintBadgeLayout[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return (
      item.label === other.label &&
      item.variant === other.variant &&
      item.pinned === other.pinned &&
      item.description === other.description &&
      item.top === other.top &&
      item.left === other.left
    );
  });
}

export type HintKeyOutcome = "activate" | "pin" | "buffer" | "clear";

export interface HintKeyResult {
  outcome: HintKeyOutcome;
  badge?: HintBadge;
  buffer: string;
}

/** A longer label that would swallow this keystroke (`f` vs `fm`). */
function hasLongerLabelPrefix(badges: readonly HintBadge[], value: string): boolean {
  return badges.some((badge) => badge.label.length > value.length && badge.label.startsWith(value));
}

/**
 * One label keystroke, Vimium-C rules. A complete label fires only when no
 * longer label shares the prefix (otherwise the longer one could never be
 * typed); a live prefix extends the buffer; and a dead end restarts from the
 * keystroke just pressed before giving up, so a mistyped first letter does not
 * throw away a valid one. Alt turns an unambiguous complete label into a
 * pinned description instead of an action.
 */
export function reduceHintKey(
  badges: readonly HintBadge[],
  buffer: string,
  letter: string,
  alt: boolean
): HintKeyResult {
  const next = buffer + letter;
  const badge = findBadge(badges, next);
  if (badge && !hasLongerLabelPrefix(badges, next)) {
    return alt ? { outcome: "pin", badge, buffer: "" } : { outcome: "activate", badge, buffer: "" };
  }
  if (hasLabelPrefix(badges, next)) return { outcome: "buffer", buffer: next };
  if (hasLabelPrefix(badges, letter)) return { outcome: "buffer", buffer: letter };
  return { outcome: "clear", buffer: "" };
}

/** Description shown when an Alt+label pins the badge: attr -> aria -> text. */
export function resolveHintDescription(
  element: HTMLElement,
  translate: (key: TranslationKey) => string
): string {
  const key = element.getAttribute(VIM_HINT_ATTRIBUTES.label);
  if (key) return translate(key as TranslationKey);
  const aria = element.getAttribute("aria-label");
  if (aria && aria.trim().length > 0) return aria.trim();
  return element.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}
