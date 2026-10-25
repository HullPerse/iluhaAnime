import { Keyboard, Pencil, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ChordChips } from "@/components/shared/keyboard/chord.keyboard.component";
import { KeybindRecorder } from "@/components/shared/keyboard/record.keyboard.component";
import Modal from "@/components/shared/modal.component";
import { Button } from "@/components/ui/button.component";
import { Input } from "@/components/ui/input.component";
import Select from "@/components/ui/select.component";
import { KEYBIND_MANIFEST, type KeybindScope } from "@/config/keyboard/manifest.config";
import { VIM_MOTION_KEYS } from "@/config/keyboard/vim.config";
import { useI18n } from "@/hooks/i18n.hook";
import { chordKey, humanizeChord, parseChord } from "@/lib/hotkeys/chord.hotkeys";
import { resolveKeybinds, type ResolvedKeybind } from "@/lib/hotkeys/resolve.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
import { patchSettings, settingsAtoms } from "@/store/settings.store";

const SCOPES: readonly KeybindScope[] = [
  "global",
  "settings",
  "player",
  "vim",
  "find",
  "menu",
  "tree",
];

type ScopeFilter = KeybindScope | "all";

const RESERVED_CHORDS: readonly string[] = [VIM_MOTION_KEYS.firstPrefix];

function chordIdentity(chord: string): string | null {
  const parsed = parseChord(chord);
  return parsed ? chordKey(parsed) : null;
}

function BindingCell({ row, scopeLabel }: { row: ResolvedKeybind; scopeLabel: string }) {
  const { t } = useI18n();
  if (row.shadowedChord) {
    const winner = KEYBIND_MANIFEST.find((entry) => entry.id === row.shadowedBy);
    return (
      <span className="flex w-60 min-w-0 shrink-0 items-center gap-1" role="cell">
        <span className="text-hint shrink-0 text-xs select-none">{scopeLabel}:</span>
        <s
          className="text-hint shrink-0 px-1 text-xs whitespace-nowrap select-none"
          title={
            winner ? t("settings.keybinds.shadowed", { name: t(winner.description) }) : undefined
          }
        >
          {humanizeChord(row.shadowedChord)}
        </s>
        {row.activeChord ? (
          <ChordChips chord={row.activeChord} />
        ) : (
          <span className="text-hint shrink-0 text-xs select-none">
            {t("settings.keybinds.unbound")}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex w-60 min-w-0 shrink-0 items-center gap-1" role="cell">
      <span className="text-hint shrink-0 text-xs select-none">{scopeLabel}:</span>
      {row.activeChord ? (
        <ChordChips chord={row.activeChord} />
      ) : (
        <span className="text-hint shrink-0 text-xs select-none">
          {t("settings.keybinds.unbound")}
        </span>
      )}
    </span>
  );
}

export function SettingsKeybinds({
  expandedSectionIds,
}: {
  expandedSectionIds?: Set<string>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ forId: string; chord: string } | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const shouldExpandAll = expandedSectionIds?.has("keybinds.list") === true;
  const [collapsed, setCollapsed] = useState<ReadonlySet<KeybindScope>>(
    shouldExpandAll ? new Set() : new Set()
  );
  const overrides = useCell(settingsAtoms.keybindOverrides);

  const scopeLabels = useMemo<Record<KeybindScope, string>>(
    () => ({
      global: t("settings.keybinds.scope.global"),
      settings: t("settings.keybinds.scope.settings"),
      player: t("settings.keybinds.scope.player"),
      vim: t("settings.keybinds.scope.vim"),
      find: t("settings.keybinds.scope.find"),
      menu: t("settings.keybinds.scope.menu"),
      tree: t("settings.keybinds.scope.tree"),
    }),
    [t]
  );

  const options = useMemo(
    () => [
      { value: "all", label: t("settings.keybinds.scope.all") },
      ...SCOPES.map((entry) => ({ value: entry, label: scopeLabels[entry] })),
    ],
    [t, scopeLabels]
  );

  const rows = useMemo(() => resolveKeybinds(overrides), [overrides]);
  const descriptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.entry.id, t(row.entry.description));
    return map;
  }, [rows, t]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const wanted = captured ? chordIdentity(captured) : null;
    const matches = (row: ResolvedKeybind) =>
      row.entry.scope === (scope === "all" ? row.entry.scope : scope) &&
      (needle === "" ||
        `${row.entry.id} ${descriptions.get(row.entry.id) ?? ""} ${row.activeChord ?? ""}`
          .toLowerCase()
          .includes(needle)) &&
      (wanted === null || (row.activeChord !== null && chordIdentity(row.activeChord) === wanted));
    const byScope = new Map<KeybindScope, ResolvedKeybind[]>();
    for (const row of rows) {
      if (!matches(row)) continue;
      const list = byScope.get(row.entry.scope) ?? [];
      list.push(row);
      byScope.set(row.entry.scope, list);
    }
    return SCOPES.map((entry) => ({ scope: entry, rows: byScope.get(entry) ?? [] })).filter(
      (group) => group.rows.length > 0
    );
  }, [rows, descriptions, query, scope, captured]);

  const overriddenCount = Object.keys(overrides).length;
  const conflictCount = rows.filter((row) => row.shadowedBy !== null).length;
  const visibleGroups = showConflicts
    ? groups
        .map((group) => ({ ...group, rows: group.rows.filter((row) => row.shadowedBy !== null) }))
        .filter((group) => group.rows.length > 0)
    : groups;
  const visibleTotal = visibleGroups.reduce((sum, group) => sum + group.rows.length, 0);

  const previewConflict = useMemo(() => {
    if (!preview) return null;
    const tentative = resolveKeybinds({ ...overrides, [preview.forId]: preview.chord });
    const loser = tentative.find((row) => row.shadowedBy === preview.forId);
    if (!loser) return null;
    return {
      name: descriptions.get(loser.entry.id) ?? loser.entry.id,
      scope: scopeLabels[loser.entry.scope],
    };
  }, [overrides, preview, descriptions, scopeLabels]);

  const toggleCollapsed = (scope: KeybindScope): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  };

  const focusRowButton = (id: string): void => {
    document.querySelector<HTMLElement>(`[data-keybind-edit="${CSS.escape(id)}"]`)?.focus();
  };

  const closeEditor = (id: string): void => {
    setEditingId(null);
    setPreview(null);
    focusRowButton(id);
  };

  const editingRow = editingId ? (rows.find((row) => row.entry.id === editingId) ?? null) : null;

  const conflict = preview?.forId === editingRow?.entry.id ? previewConflict : null;

  const saveOverride = (id: string, chord: string | null): void => {
    const next = { ...overrides };
    if (chord === null) next[id] = null;
    else next[id] = chord;
    patchSettings({ keybindOverrides: next });
    closeEditor(id);
  };

  const resetRow = (id: string): void => {
    if (!(id in overrides)) return;
    const next = { ...overrides };
    delete next[id];
    patchSettings({ keybindOverrides: next });
    focusRowButton(id);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="ui-panel bg-primary sticky -top-1 z-10 flex gap-1 p-1">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.keybinds.search")}
          aria-label={t("settings.keybinds.search")}
          className="min-w-0 flex-1"
        />
        <Button
          size="icon"
          variant={capturing || captured ? "secondary" : "default"}
          title={t("settings.keybinds.capture")}
          aria-label={t("settings.keybinds.capture")}
          aria-pressed={capturing || captured !== null}
          onClick={() => {
            setCapturing((value) => !value);
            setCaptured(null);
          }}
        >
          <Keyboard className="size-3.5" />
        </Button>
        <Select
          value={scope}
          onChange={(value) => setScope(value as ScopeFilter)}
          options={options}
          aria-label={t("settings.keybinds.scope")}
          className="w-32 shrink-0"
        />
        <span className="flex shrink-0 items-center gap-0.5">
          <Button
            size="icon"
            variant={showConflicts ? "secondary" : "default"}
            title={t("settings.keybinds.conflicts.only")}
            aria-label={t("settings.keybinds.conflicts.only")}
            aria-pressed={showConflicts}
            onClick={() => setShowConflicts((value) => !value)}
          >
            <TriangleAlert className="size-3.5" />
          </Button>
          {conflictCount > 0 ? (
            <span className="bg-highlight px-1 text-xs text-white tabular-nums select-none">
              {conflictCount}
            </span>
          ) : null}
        </span>
        <Button
          size="default"
          variant="secondary"
          disabled={overriddenCount === 0}
          title={t("settings.keybinds.reset.all")}
          onClick={() => patchSettings({ keybindOverrides: {} })}
        >
          {t("settings.keybinds.reset.all")}
        </Button>
      </div>
      {capturing ? (
        <KeybindRecorder
          currentChord={null}
          reservedChords={RESERVED_CHORDS}
          canReset={false}
          bare
          onCommit={(chord) => {
            if (chord) setCaptured(chord);
            setCapturing(false);
          }}
          onReset={() => undefined}
          onCancel={() => setCapturing(false)}
        />
      ) : null}
      {captured ? (
        <div className="flex items-center gap-1">
          <ChordChips chord={captured} />
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("settings.keybinds.capture")}
            onClick={() => setCaptured(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}
      <div
        role="table"
        aria-label={t("settings.keybinds")}
        data-find-section="list"
        className="windows95-border bg-field flex flex-col overflow-hidden"
      >
        <div role="row" className="bg-surface flex items-center gap-2 px-1 py-0.5">
          <span role="columnheader" className="text-hint w-60 shrink-0 text-xs select-none">
            {t("settings.keybinds.column.binding")}
          </span>
          <span role="columnheader" className="text-hint min-w-0 flex-1 text-xs select-none">
            {t("settings.keybinds.column.action")}
          </span>
          <span
            role="columnheader"
            className="text-hint w-10 shrink-0 text-center text-xs select-none"
          >
            {t("settings.keybinds.column.mode")}
          </span>
          <span role="columnheader" className="w-14 shrink-0" aria-hidden="true" />
        </div>
        {visibleGroups.map((group) => (
          <div key={group.scope}>
            <button
              type="button"
              aria-expanded={!collapsed.has(group.scope)}
              onClick={() => toggleCollapsed(group.scope)}
              className="bg-surface border-muted hover:bg-surface flex w-full cursor-pointer items-center gap-1 border-y px-1 py-0.5 text-left"
            >
              <span className="windows95-active-border bg-primary text-text flex size-4 shrink-0 items-center justify-center text-xs leading-none select-none">
                {collapsed.has(group.scope) ? "+" : "−"}
              </span>
              <span className="windows95-text text-xs font-bold">{scopeLabels[group.scope]}</span>
              <span className="bg-highlight px-1 text-xs text-white tabular-nums">
                {group.rows.length}
              </span>
            </button>
            {collapsed.has(group.scope)
              ? null
              : group.rows.map((row) => (
                  <div key={row.entry.id}>
                    <div
                      role="row"
                      onClick={() => setSelectedId(row.entry.id)}
                      onDoubleClick={() => setEditingId(row.entry.id)}
                      className={`border-muted flex items-center gap-2 border-b px-1 py-0.5 last:border-b-0 ${
                        selectedId === row.entry.id
                          ? "bg-highlight [&_.text-hint]:text-white [&_.windows95-text]:text-white"
                          : "hover:bg-surface"
                      }`}
                    >
                      <BindingCell row={row} scopeLabel={scopeLabels[group.scope]} />
                      <span
                        className="windows95-text min-w-0 flex-1 truncate text-xs"
                        role="cell"
                        title={descriptions.get(row.entry.id)}
                      >
                        {descriptions.get(row.entry.id)}
                      </span>
                      {row.entry.mode === "vim" ? (
                        <span
                          role="cell"
                          className="bg-highlight w-10 shrink-0 px-0.5 text-center text-xs text-white select-none"
                        >
                          VIM
                        </span>
                      ) : (
                        <span
                          role="cell"
                          className="text-hint w-10 shrink-0 text-center text-xs select-none"
                        >
                          BASE
                        </span>
                      )}
                      <span
                        role="cell"
                        className="flex w-14 shrink-0 items-center justify-end gap-0.5"
                      >
                        {row.shadowedBy ? (
                          <TriangleAlert
                            className="text-destructive size-3.5 shrink-0"
                            aria-label={t("settings.keybinds.shadowed", {
                              name: descriptions.get(row.shadowedBy) ?? row.shadowedBy,
                            })}
                          />
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-5"
                          title={t("settings.keybinds.edit")}
                          aria-label={`edit ${row.entry.id}`}
                          data-keybind-edit={row.entry.id}
                          onClick={() => setEditingId(row.entry.id)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        {row.overridden ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-5"
                            title={t("settings.keybinds.reset.row")}
                            aria-label={`reset ${row.entry.id}`}
                            onClick={() => resetRow(row.entry.id)}
                          >
                            <RotateCcw className="size-3" />
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        ))}
        {visibleTotal === 0 ? (
          <span className="windows95-text text-hint px-1 py-0.5 text-xs">
            {t("settings.keybinds.empty")}
          </span>
        ) : null}
      </div>
      {editingRow ? (
        <Modal
          header={t("settings.keybinds.record.title")}
          onClose={() => closeEditor(editingRow.entry.id)}
          className="w-[34rem]"
        >
          <KeybindRecorder
            currentChord={editingRow.activeChord}
            reservedChords={RESERVED_CHORDS}
            canReset={editingRow.overridden}
            actionTitle={descriptions.get(editingRow.entry.id) ?? editingRow.entry.id}
            actionId={editingRow.entry.id}
            scope={editingRow.entry.scope}
            conflict={conflict}
            onPreview={(chord) => setPreview(chord ? { forId: editingRow.entry.id, chord } : null)}
            onCommit={(chord) => saveOverride(editingRow.entry.id, chord)}
            onReset={() => {
              resetRow(editingRow.entry.id);
              closeEditor(editingRow.entry.id);
            }}
            onCancel={() => closeEditor(editingRow.entry.id)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
