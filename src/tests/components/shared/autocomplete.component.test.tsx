// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { useSettingsStore } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ autocompleteMode: "both" });
});

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
    expect(ghost?.querySelector("span")?.classList.contains("font-bold")).toBe(
      true
    );
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
    useSettingsStore.setState({ autocompleteMode: "off" });
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
    useSettingsStore.setState({ autocompleteMode: "dropdown" });
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
    expect(
      view.container.querySelector(".inline-autocomplete-ghost")
    ).not.toBeNull();
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
    useSettingsStore.setState({ autocompleteMode: "dropdown" });
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
    useSettingsStore.setState({ autocompleteMode: "both" });
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
    expect(
      view.container.querySelector(".inline-autocomplete-ghost")
    ).not.toBeNull();
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
});
