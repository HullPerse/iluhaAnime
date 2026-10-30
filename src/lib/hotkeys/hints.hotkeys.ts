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

export interface HintBadge {
  element: HTMLElement;
  label: string;
  variant: HintVariant;
}

export interface HintScanResult {
  badges: HintBadge[];
  overflow: number;
}

export interface HintScanOptions {
  max?: number;
  alphabet?: string;
  maxLabelLength?: number;
}

const FOCUS_SELECTOR = 'input:not([type="hidden"]), textarea, select, [contenteditable="true"]';
const SCANNER_SELECTOR = `button, a, [role="button"], [data-vim-target], ${FOCUS_SELECTOR}`;

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

export function labelLengthFor(
  count: number,
  alphabetLength: number,
  maxLabelLength: number
): number {
  let length = 1;
  while (length < maxLabelLength && alphabetLength ** length < count) length += 1;
  return length;
}

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

export const MIN_HINT_TARGET_PX = 8;

function isVisible(rect: DOMRect): boolean {
  return rect.width >= MIN_HINT_TARGET_PX && rect.height >= MIN_HINT_TARGET_PX;
}

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
  box: DOMRect | null;
}

function makeClipTest(): (element: HTMLElement, rect: DOMRect) => boolean {
  const ancestors = new Map<Element, ClipAncestor>();
  return (element, rect) => {
    let elementPosition: string | null = null;
    for (
      let node = element.parentElement;
      node && node !== document.body && node !== document.documentElement;
      node = node.parentElement
    ) {
      let entry = ancestors.get(node);
      if (entry === undefined) {
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
      if (elementPosition === null) elementPosition = getComputedStyle(element).position;
      if (elementPosition !== "fixed") return true;
    }
    return false;
  };
}

function collectStickyBoxes(root: ParentNode): DOMRect[] {
  const boxes: DOMRect[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('[class~="sticky"]')) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) boxes.push(rect);
  }
  return boxes;
}

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
    (box) =>
      rect.top < box.bottom &&
      box.top < rect.bottom &&
      rect.left < box.right &&
      box.left < rect.right
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

  if (contentRoots.length > 0) {
    const rank = (element: HTMLElement): number => {
      for (const contentRoot of contentRoots) {
        if (contentRoot.contains(element)) return 0;
      }
      return 1;
    };
    collected.sort(
      (a, b) =>
        rank(a.element) - rank(b.element) || a.rect.top - b.rect.top || a.rect.left - b.rect.left
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

export interface HintBadgeLayout {
  label: string;
  variant: HintVariant;
  description: string;
  pinned: boolean;
  top: number;
  left: number;
}

export const HINT_BADGE_OFFSET = 24;

export const BADGE_CHAR_PX = 7;
export const PINNED_BADGE_MAX_PX = 256;
const BADGE_PADDING_PX = 8;
const BADGE_ICON_PX = 12;
const BADGE_ROW_PX = 20;
const MAX_COLLISION_PASSES = 5;

export function badgeWidth(layout: HintBadgeLayout): number {
  const grown = layout.pinned && layout.description.length > 0;
  const chars = grown ? layout.label.length + layout.description.length : layout.label.length;
  const text = grown ? Math.min(PINNED_BADGE_MAX_PX, chars * BADGE_CHAR_PX) : chars * BADGE_CHAR_PX;
  return text + BADGE_PADDING_PX + (layout.variant === "plain" ? 0 : BADGE_ICON_PX);
}

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
    if (!badge.element.isConnected) continue;
    if (!isRendered(badge.element)) continue;
    const rect = badge.element.getBoundingClientRect();
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

function hasLongerLabelPrefix(badges: readonly HintBadge[], value: string): boolean {
  return badges.some((badge) => badge.label.length > value.length && badge.label.startsWith(value));
}

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
