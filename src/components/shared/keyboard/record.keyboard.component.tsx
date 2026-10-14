import {
  FileText,
  Globe,
  Keyboard,
  ListTree,
  Menu,
  Play,
  Search,
  Settings,
  TriangleAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import type { KeybindScope } from "@/config/keyboard/manifest.config";
import { useI18n } from "@/hooks/i18n.hook";
import { humanizeChord, parseChord } from "@/lib/hotkeys/chord.hotkeys";

import { ChordChips } from "./chord.keyboard.component";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta"]);

interface LiveModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

const NO_MODIFIERS: LiveModifiers = { ctrl: false, alt: false, shift: false, meta: false };

const MODIFIER_BUTTONS: readonly { id: keyof LiveModifiers; label: string }[] = [
  { id: "ctrl", label: "Ctrl" },
  { id: "alt", label: "Alt" },
  { id: "shift", label: "Shift" },
  { id: "meta", label: "Win" },
];

/** Action icon follows the entry scope; unknown scopes get the mockup file icon. */
const SCOPE_ICONS: Record<KeybindScope, LucideIcon> = {
  global: Globe,
  settings: Settings,
  player: Play,
  vim: Keyboard,
  find: Search,
  menu: Menu,
  tree: ListTree,
};

function chordFromKeyboardEvent(event: React.KeyboardEvent, live: LiveModifiers): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || live.ctrl) parts.push("ctrl");
  if (event.altKey || live.alt) parts.push("alt");
  if (event.shiftKey || live.shift) parts.push("shift");
  if (event.metaKey || live.meta) parts.push("meta");
  parts.push(event.code);
  return parts.join("+");
}

/**
 * Single-chord recorder for the keybinds tab, laid out like the approved
 * mockup: action group with a scope icon, current chord with Clear, new
 * chord capture with an X button and display-only modifier indicators
 * (they light up while the key is held, nothing latches), conflict lines
 * inside the new-chord group, Reset/OK/Cancel footer. The draft starts
 * prefilled with the current binding; typing replaces it, Enter commits,
 * Backspace clears, Escape cancels. The capture carries
 * `data-vim-disabled` and stops propagation in capture phase, so neither
 * the vim engine nor any global registry can steal the keystroke being
 * recorded. Reserved chords (sequence prefixes) cannot be saved: OK stays
 * disabled with a note. In `bare` mode only the capture box renders
 * (reverse lookup): Enter commits immediately, Esc cancels.
 */
export function KeybindRecorder({
  currentChord,
  reservedChords,
  canReset,
  bare,
  actionTitle,
  actionId,
  scope,
  conflict,
  onPreview,
  onCommit,
  onReset,
  onCancel,
}: {
  currentChord: string | null;
  reservedChords: readonly string[];
  canReset: boolean;
  bare?: boolean;
  actionTitle?: string;
  actionId?: string;
  scope?: KeybindScope;
  conflict?: { name: string; scope: string } | null;
  onPreview?: (chord: string | null) => void;
  onCommit: (chord: string | null) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(currentChord);
  const [live, setLive] = useState<LiveModifiers>(NO_MODIFIERS);

  const blocked = draft !== null && reservedChords.includes(draft);
  const dirty = draft !== currentChord;
  const ScopeIcon = scope ? (SCOPE_ICONS[scope] ?? FileText) : FileText;

  const applyDraft = (next: string | null): void => {
    setDraft(next);
    onPreview?.(next);
  };

  const syncLive = (event: React.KeyboardEvent): void => {
    setLive({
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      meta: event.metaKey,
    });
  };

  const capture = (event: React.KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    syncLive(event);
    if (event.code === "Escape") {
      onCancel();
      return;
    }
    if (event.code === "Backspace") {
      applyDraft(null);
      return;
    }
    if (event.code === "Enter") {
      if (!blocked) onCommit(draft);
      return;
    }
    const next = chordFromKeyboardEvent(event, live);
    if (next && parseChord(next)) applyDraft(next);
  };

  if (bare) {
    return (
      <div
        tabIndex={0}
        role="textbox"
        aria-label={t("settings.keybinds.record.placeholder")}
        data-vim-disabled=""
        autoFocus
        onKeyDownCapture={capture}
        className="windows95-active-border bg-primary flex min-h-9 items-center justify-center gap-1 px-1 outline-none"
      >
        {draft ? (
          <ChordChips chord={draft} />
        ) : (
          <span className="text-hint text-xs select-none">
            {t("settings.keybinds.record.placeholder")}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {actionTitle ? (
        <fieldset className="border-border border px-1 pt-1 pb-2">
          <legend className="px-1 text-xs">{t("settings.keybinds.record.action")}</legend>
          <div className="flex items-center gap-2 px-1">
            <span data-scope-icon={scope ?? "unknown"}>
              <ScopeIcon className="text-hint size-8 shrink-0" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs">{actionTitle}</div>
              {actionId ? <div className="text-hint truncate text-xs">{actionId}</div> : null}
            </div>
          </div>
        </fieldset>
      ) : null}
      <fieldset className="border-border border px-1 pt-1 pb-2">
        <legend className="px-1 text-xs">{t("settings.keybinds.record.currentChord")}</legend>
        <div className="flex items-center gap-1 px-1">
          <div className="windows95-border bg-field flex min-h-[var(--ui-control-height)] min-w-0 flex-1 items-center px-1.5">
            {currentChord ? (
              <ChordChips chord={currentChord} />
            ) : (
              <span className="text-hint shrink-0 text-xs select-none">
                {t("settings.keybinds.unbound")}
              </span>
            )}
          </div>
          <Button size="default" disabled={draft === null} onClick={() => applyDraft(null)}>
            {t("settings.keybinds.record.clear")}
          </Button>
        </div>
      </fieldset>
      <fieldset className="border-border border px-1 pt-1 pb-2">
        <legend className="px-1 text-xs">{t("settings.keybinds.record.newChord")}</legend>
        <div className="relative px-1">
          <Input
            readOnly
            autoFocus
            data-vim-disabled=""
            value={draft ? humanizeChord(draft) : ""}
            placeholder={t("settings.keybinds.record.placeholder")}
            aria-label={t("settings.keybinds.record.placeholder")}
            onKeyDownCapture={capture}
            onKeyUpCapture={syncLive}
            onBlur={() => setLive(NO_MODIFIERS)}
            className="pr-8"
          />
          <button
            type="button"
            aria-label={t("settings.keybinds.record.clear")}
            onClick={() => applyDraft(null)}
            className="windows95-active-border bg-primary absolute top-1/2 right-2 inline-flex size-5 -translate-y-1/2 items-center justify-center opacity-70 hover:cursor-pointer hover:opacity-100"
            style={{ visibility: draft ? "visible" : "hidden" }}
          >
            <X className="size-3" />
          </button>
        </div>
        <div className="flex items-center gap-1 px-1 pt-1" aria-hidden="true">
          {MODIFIER_BUTTONS.map((modifier) => (
            <span
              key={modifier.id}
              className={`windows95-border inline-flex min-h-[var(--ui-control-height)] items-center px-1.5 text-xs select-none ${
                live[modifier.id] ? "bg-primary text-text" : "bg-field text-hint"
              }`}
            >
              {modifier.label}
            </span>
          ))}
          <span className="text-hint text-xs select-none">+</span>
          <div className="windows95-border bg-field flex min-h-[var(--ui-control-height)] min-w-12 flex-1 items-center justify-center px-1">
            {draft ? <span className="truncate text-xs">{humanizeChord(draft)}</span> : null}
          </div>
        </div>
        <span className="text-hint px-1 text-xs select-none">
          {t("settings.keybinds.record.hint")}
        </span>
        {conflict ? (
          <div className="flex gap-1 px-1 pt-1">
            <TriangleAlert className="text-destructive size-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-destructive text-xs">
                {t("settings.keybinds.record.conflictUsed")}
              </div>
              <div className="truncate text-xs">
                {conflict.name} ({conflict.scope})
              </div>
            </div>
          </div>
        ) : null}
      </fieldset>
      {blocked ? (
        <span className="text-destructive px-0.5 text-xs select-none">
          {t("settings.keybinds.record.reserved")}
        </span>
      ) : null}
      <div className="flex gap-1">
        <Button size="default" variant="secondary" disabled={!canReset} onClick={onReset}>
          {t("settings.keybinds.record.reset")}
        </Button>
        <span className="min-w-0 flex-1" />
        <Button size="default" disabled={!dirty || blocked} onClick={() => onCommit(draft)}>
          {t("common.ok")}
        </Button>
        <Button size="default" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
