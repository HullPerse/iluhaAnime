import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PageFindBar from "@/components/shared/keyboard/findBar.keyboard.component";
import {
  closeFindBar,
  openFindBar,
  setFindBarCaseSensitive,
  setFindBarWholeWords,
} from "@/store/findBar.store";
import { patchSettings } from "@/store/settings.store";

const nodes: HTMLElement[] = [];

function content(text: string): HTMLElement {
  const element = document.createElement("div");
  element.textContent = text;
  document.body.append(element);
  nodes.push(element);
  return element;
}

beforeEach(() => {
  patchSettings({ language: "en" });
  closeFindBar();
  if (typeof Element.prototype.scrollIntoView !== "function") {
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = () => undefined;
  } else {
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
  }
});

afterEach(() => {
  cleanup();
  closeFindBar();
  setFindBarCaseSensitive(false);
  setFindBarWholeWords(false);
  vi.restoreAllMocks();
  for (const item of nodes.splice(0)) item.remove();
});

function openBar(): void {
  render(<PageFindBar />);
  openFindBar();
}

describe("PageFindBar", () => {
  it("renders nothing while closed", () => {
    render(<PageFindBar />);
    expect(screen.queryByRole("search")).toBeNull();
  });

  it("opens with a focused input and an empty counter", async () => {
    openBar();
    const input = await screen.findByPlaceholderText("Find on page...");
    expect(document.activeElement).toBe(input);
    expect(screen.getByText("0 / 0")).toBeTruthy();
  });

  it("counts matches while typing", async () => {
    content("alpha beta alpha");
    const user = userEvent.setup();
    openBar();
    await user.type(await screen.findByPlaceholderText("Find on page..."), "alpha");
    expect(await screen.findByText("1 / 2")).toBeTruthy();
  });

  it("steps through matches with Enter and Shift+Enter", async () => {
    content("alpha beta alpha");
    const user = userEvent.setup();
    openBar();
    const input = await screen.findByPlaceholderText("Find on page...");
    await user.type(input, "alpha");
    await screen.findByText("1 / 2");
    await user.keyboard("{Enter}");
    expect(await screen.findByText("2 / 2")).toBeTruthy();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(await screen.findByText("1 / 2")).toBeTruthy();
  });

  it("opens on Ctrl+F", async () => {
    render(<PageFindBar />);
    expect(screen.queryByRole("search")).toBeNull();
    fireEvent.keyDown(window, { key: "f", code: "KeyF", ctrlKey: true });
    expect(await screen.findByPlaceholderText("Find on page...")).toBeTruthy();
  });

  it("closes on Escape through the overlay stack", async () => {
    openBar();
    const input = await screen.findByPlaceholderText("Find on page...");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("search")).toBeNull();
  });

  it("marks search inside a virtualized list", async () => {
    const holder = document.createElement("div");
    holder.dataset.virtualList = "";
    const button = document.createElement("button");
    button.textContent = "inside";
    holder.append(button);
    document.body.append(holder);
    nodes.push(holder);
    render(<PageFindBar />);
    button.focus();
    fireEvent.keyDown(button, { key: "f", code: "KeyF", ctrlKey: true });
    expect(await screen.findByText("Searches visible content only")).toBeTruthy();
  });

  it("hides the virtual marker outside virtualized lists", async () => {
    openBar();
    await screen.findByPlaceholderText("Find on page...");
    expect(screen.queryByText("Searches visible content only")).toBeNull();
  });

  it("steps with the arrow buttons", async () => {
    content("alpha beta alpha");
    const user = userEvent.setup();
    openBar();
    await user.type(await screen.findByPlaceholderText("Find on page..."), "alpha");
    await screen.findByText("1 / 2");
    await user.click(screen.getByRole("button", { name: "Next match" }));
    expect(await screen.findByText("2 / 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Previous match" }));
    expect(await screen.findByText("1 / 2")).toBeTruthy();
  });

  it("steps with n outside editable targets", async () => {
    content("alpha beta alpha");
    const user = userEvent.setup();
    openBar();
    await user.type(await screen.findByPlaceholderText("Find on page..."), "alpha");
    await screen.findByText("1 / 2");
    const button = document.createElement("button");
    button.textContent = "row";
    document.body.append(button);
    nodes.push(button);
    button.focus();
    fireEvent.keyDown(button, { key: "n", code: "KeyN" });
    expect(await screen.findByText("2 / 2")).toBeTruthy();
    fireEvent.keyDown(button, { key: "N", code: "KeyN", shiftKey: true });
    expect(await screen.findByText("1 / 2")).toBeTruthy();
  });

  it("narrows to whole words behind its toggle", async () => {
    content("alphabet alpha");
    const user = userEvent.setup();
    openBar();
    await user.type(await screen.findByPlaceholderText("Find on page..."), "alpha");
    await screen.findByText("1 / 2");
    await user.click(screen.getByRole("button", { name: "Whole words only" }));
    expect(await screen.findByText("1 / 1")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Whole words only" }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("respects case behind its toggle", async () => {
    content("Alpha ALPHA");
    const user = userEvent.setup();
    openBar();
    await user.type(await screen.findByPlaceholderText("Find on page..."), "Alpha");
    await screen.findByText("1 / 2");
    await user.click(screen.getByRole("button", { name: "Match case" }));
    expect(await screen.findByText("1 / 1")).toBeTruthy();
  });
});
