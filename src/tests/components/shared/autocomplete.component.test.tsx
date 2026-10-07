import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { patchSettings } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  patchSettings({ autocompleteMode: "both" });
  vi.restoreAllMocks();
});

function mockSpellRect() {
  const rect = {
    x: 40,
    y: 10,
    width: 40,
    height: 12,
    top: 10,
    right: 80,
    bottom: 22,
    left: 40,
    toJSON: () => {},
  } as unknown as DOMRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect);
}

describe("InlineAutocompleteInput", () => {
  it("aligns the ghost text with the input content box", async () => {
    const user = userEvent.setup();
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        className="h-9 font-bold"
        completion="Frieren: Beyond Journey's End"
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));

    const ghost = view.container.querySelector(".inline-autocomplete-ghost");
    expect(ghost?.classList.contains("border-2")).toBe(true);
    expect(ghost?.classList.contains("px-1.5")).toBe(true);
    expect(ghost?.querySelector("span")?.classList.contains("font-bold")).toBe(true);
    expect(ghost?.textContent).toContain("eren: Beyond Journey's End");
  });

  it("accepts the ghost completion with Tab", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        completion="Frieren: Beyond Journey's End"
        onAcceptCompletion={onAccept}
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    await user.keyboard("{Tab}");

    expect(onAccept).toHaveBeenCalledWith("Frieren: Beyond Journey's End");
  });

  it("does not render a completion or menu when autocomplete is off", async () => {
    const user = userEvent.setup();
    patchSettings({ autocompleteMode: "off" });
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        completion="Frieren"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    expect(view.container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects a dropdown suggestion with ArrowDown and Enter", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    patchSettings({ autocompleteMode: "dropdown" });
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        suggestions={[
          { kind: "anime", score: 100, value: "Frieren" },
          { kind: "history", score: 90, value: "Frieren 1080p" },
        ]}
        value="fri"
        onAcceptCompletion={onAccept}
        onChange={() => {}}
      />
    );

    const input = screen.getByRole("textbox", { name: "Search" });
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onAccept).toHaveBeenCalledWith("Frieren");
  });

  it("hides the ghost completion with Escape", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        completion="Frieren"
        onDismissCompletion={onDismiss}
        value="fri"
        onChange={() => {}}
      />
    );

    const input = screen.getByRole("textbox", { name: "Search" });
    await user.click(input);
    expect(view.container.querySelector(".inline-autocomplete-ghost")).not.toBeNull();
    await user.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalledOnce();
    expect(view.container.querySelector(".inline-autocomplete-ghost")).toBeNull();
  });

  it("shows the suggestion menu when focused", async () => {
    const user = userEvent.setup();
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    expect(screen.queryByRole("listbox")).toBeNull();
    await user.click(screen.getByRole("textbox", { name: "Search" }));

    expect(screen.getByRole("listbox")).not.toBeNull();
    expect(screen.getByRole("option", { name: /Frieren/ })).not.toBeNull();
  });

  it("highlights fuzzy-matched characters in the menu", async () => {
    const user = userEvent.setup();
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="frn"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));

    const option = screen.getByRole("option", { name: /Frieren/ });
    const highlighted = option.querySelectorAll(".text-highlight");
    expect(highlighted.length).toBe(2);
    expect(highlighted[0].textContent).toBe("Fr");
    expect(highlighted[1].textContent).toBe("n");
  });

  it("hides the ghost and shows only the menu in dropdown mode", async () => {
    const user = userEvent.setup();
    patchSettings({ autocompleteMode: "dropdown" });
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        completion="Frieren"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    expect(view.container.querySelector(".inline-autocomplete-ghost")).toBeNull();
    await user.click(screen.getByRole("textbox", { name: "Search" }));
    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("shows the ghost and the menu together in both mode", async () => {
    const user = userEvent.setup();
    patchSettings({ autocompleteMode: "both" });
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        completion="Frieren"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    expect(view.container.querySelector(".inline-autocomplete-ghost")).not.toBeNull();
    expect(screen.getByRole("listbox")).not.toBeNull();
  });

  it("groups suggestions into sections ordered by top score", async () => {
    const user = userEvent.setup();
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        suggestions={[
          { kind: "history", score: 90, value: "Frieren 1080p" },
          { kind: "anime", score: 100, value: "Frieren" },
          { kind: "local", score: 80, value: "Frieren S01E01.mkv" },
          { kind: "anime", score: 95, value: "Frieren S2" },
        ]}
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));

    const sections = [...view.container.querySelectorAll("[data-section]")].map(
      (node) => (node as HTMLElement).dataset.section
    );
    expect(sections).toEqual(["anime", "history", "local"]);

    const options = screen.getAllByRole("option").map((node) => node.textContent);
    expect(options[0]).toContain("Frieren");
    expect(options[1]).toContain("Frieren S2");
    expect(options[2]).toContain("Frieren 1080p");
    expect(options[3]).toContain("Frieren S01E01.mkv");
  });

  it("renders the footer key hints with the menu", async () => {
    const user = userEvent.setup();
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    expect(view.container.querySelector("[data-footer]")).toBeNull();
    await user.click(screen.getByRole("textbox", { name: "Search" }));

    const footer = view.container.querySelector("[data-footer]");
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain("Tab");
  });

  it("shows recent history first when the input is empty, then suggestions while typing", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        history={["monster", "frieren 1080p", "shingeki season 2"]}
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value=""
        onAcceptCompletion={onAccept}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));

    const historyOptions = screen.getAllByRole("option").map((node) => node.textContent);
    expect(historyOptions[0]).toContain("monster");
    expect(historyOptions[1]).toContain("frieren 1080p");
    expect(historyOptions[2]).toContain("shingeki season 2");

    await user.click(screen.getByRole("option", { name: /frieren 1080p/ }));
    expect(onAccept).toHaveBeenCalledWith("frieren 1080p");
  });
  it("highlights token ranges in the backdrop and hides the input text", () => {
    const view = render(
      <InlineAutocompleteInput
        aria-label="Search"
        value="studio=MAPPA frieren"
        highlightRanges={[{ start: 0, end: 12 }]}
        onChange={() => {}}
      />
    );

    const highlighted = view.container.querySelector(".bg-highlight");
    expect(highlighted?.textContent).toBe("studio=MAPPA");
    expect(
      screen.getByRole("textbox", { name: "Search" }).classList.contains("text-transparent")
    ).toBe(true);
  });

  it("renders no highlight layer without ranges", () => {
    const view = render(
      <InlineAutocompleteInput aria-label="Search" value="frieren" onChange={() => {}} />
    );

    expect(view.container.querySelector(".bg-highlight")).toBeNull();
    expect(
      screen.getByRole("textbox", { name: "Search" }).classList.contains("text-transparent")
    ).toBe(false);
  });

  it("underlines a warned word amber and an error word red", () => {
    const warn = render(
      <InlineAutocompleteInput
        aria-label="Search warn"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onChange={() => {}}
      />
    );
    const warnSpan = warn.container.querySelector('[data-spell="warn"]');
    expect(warnSpan?.textContent).toBe("friren");
    expect(warnSpan?.className).toContain("amber-500");
    warn.unmount();
    cleanup();

    render(
      <InlineAutocompleteInput
        aria-label="Search error"
        value="frien"
        spellCheck={{ correction: "frieren", start: 0, end: 5, severity: "error", word: "frien" }}
        onChange={() => {}}
      />
    );
    const errorSpan = document.querySelector('[data-spell="error"]');
    expect(errorSpan?.textContent).toBe("frien");
    expect(errorSpan?.className).toContain("red-500");
  });
});

describe("InlineAutocompleteInput spell quick-fix", () => {
  it("shows the quick-fix card with word, correction and actions when focused", async () => {
    mockSpellRect();
    const user = userEvent.setup();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));

    const tip = await screen.findByRole("tooltip");
    expect(tip.textContent).toContain("friren");
    expect(tip.textContent).toContain("frieren");
    expect(tip.textContent).toContain("Tab");
    expect(tip.querySelector(".text-highlight")?.textContent).toBe("fri");
    expect(tip.querySelectorAll("button").length).toBe(2);
  });

  it("applies the spell correction with Tab when there is no ghost or menu selection", async () => {
    const user = userEvent.setup();
    const onApplySpell = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onApplySpellCorrection={onApplySpell}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{Tab}");

    expect(onApplySpell).toHaveBeenCalledOnce();
  });

  it("does not hijack Shift+Tab for the spell correction", async () => {
    const user = userEvent.setup();
    const onApplySpell = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onApplySpellCorrection={onApplySpell}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(onApplySpell).not.toHaveBeenCalled();
  });

  it("prefers the ghost completion over the spell correction on Tab", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onApplySpell = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        completion="friren beyond"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onAcceptCompletion={onAccept}
        onApplySpellCorrection={onApplySpell}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{Tab}");

    expect(onAccept).toHaveBeenCalledWith("friren beyond");
    expect(onApplySpell).not.toHaveBeenCalled();
  });

  it("prefers the active menu selection over the spell correction on Tab", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onApplySpell = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onAcceptCompletion={onAccept}
        onApplySpellCorrection={onApplySpell}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{ArrowDown}{Tab}");

    expect(onAccept).toHaveBeenCalledWith("Frieren");
    expect(onApplySpell).not.toHaveBeenCalled();
  });

  it("applies the spell correction from the quick-fix button", async () => {
    mockSpellRect();
    const user = userEvent.setup();
    const onApplySpell = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onApplySpellCorrection={onApplySpell}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    const tip = await screen.findByRole("tooltip");
    await user.click(tip.querySelectorAll("button")[0]);

    expect(onApplySpell).toHaveBeenCalledOnce();
  });

  it("saves the word to the dictionary from the quick-fix button", async () => {
    mockSpellRect();
    const user = userEvent.setup();
    const onSaveWord = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onAddWordToDictionary={onSaveWord}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    const tip = await screen.findByRole("tooltip");
    await user.click(tip.querySelectorAll("button")[1]);

    expect(onSaveWord).toHaveBeenCalledOnce();
  });

  it("shows the Ctrl+Tab hint for the dictionary action", async () => {
    mockSpellRect();
    const user = userEvent.setup();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));

    const hintTip = await screen.findByRole("tooltip");
    expect(hintTip.textContent).toContain("Ctrl+Tab");
  });

  it("saves the word with Ctrl+Tab when there is no ghost or menu selection", async () => {
    const user = userEvent.setup();
    const onSaveWord = vi.fn();
    const onApplySpell = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onApplySpellCorrection={onApplySpell}
        onAddWordToDictionary={onSaveWord}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{Control>}{Tab}{/Control}");

    expect(onSaveWord).toHaveBeenCalledOnce();
    expect(onApplySpell).not.toHaveBeenCalled();
  });

  it("does not hijack Ctrl+Shift+Tab for the dictionary action", async () => {
    const user = userEvent.setup();
    const onSaveWord = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onAddWordToDictionary={onSaveWord}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{Control>}{Shift>}{Tab}{/Shift}{/Control}");

    expect(onSaveWord).not.toHaveBeenCalled();
  });

  it("prefers the dictionary save over the ghost completion on Ctrl+Tab", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onSaveWord = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        completion="friren beyond"
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onAcceptCompletion={onAccept}
        onAddWordToDictionary={onSaveWord}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{Control>}{Tab}{/Control}");

    expect(onSaveWord).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("prefers the dictionary save over the active menu selection on Ctrl+Tab", async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onSaveWord = vi.fn();
    render(
      <InlineAutocompleteInput
        aria-label="Search spell"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="friren"
        spellCheck={{ correction: "frieren", start: 0, end: 6, severity: "warn", word: "friren" }}
        onAcceptCompletion={onAccept}
        onAddWordToDictionary={onSaveWord}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search spell" }));
    await user.keyboard("{ArrowDown}{Control>}{Tab}{/Control}");

    expect(onSaveWord).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe("InlineAutocompleteInput placement", () => {
  it("renders the menu below the input by default", async () => {
    const user = userEvent.setup();
    patchSettings({ autocompleteMode: "dropdown" });
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    const menu = await screen.findByRole("listbox");
    expect(menu.classList.contains("top-full")).toBe(true);
    expect(menu.classList.contains("bottom-full")).toBe(false);
  });

  it("renders the menu above the input with placement above", async () => {
    const user = userEvent.setup();
    patchSettings({ autocompleteMode: "dropdown" });
    render(
      <InlineAutocompleteInput
        aria-label="Search"
        placement="above"
        suggestions={[{ kind: "anime", score: 100, value: "Frieren" }]}
        value="fri"
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("textbox", { name: "Search" }));
    const menu = await screen.findByRole("listbox");
    expect(menu.classList.contains("bottom-full")).toBe(true);
    expect(menu.classList.contains("top-full")).toBe(false);
  });
});
