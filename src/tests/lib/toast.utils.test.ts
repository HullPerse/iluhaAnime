import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { showToast } from "@/lib/toast.utils";
import { useSettingsStore } from "@/store/settings.store";

beforeEach(() => {
  vi.useFakeTimers();
  useSettingsStore.setState({ toastDuration: 1000 });
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("showToast", () => {
  it("appends a toast with the message", () => {
    showToast("Saved");

    const toast = document.body.querySelector(".windows95-border");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain("Saved");
  });

  it("escapes html in the message", () => {
    showToast("<img src=x onerror=alert(1)>");

    expect(document.body.querySelector("img")).toBeNull();
    const toast = document.body.querySelector(".windows95-border");
    expect(toast?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(toast?.innerHTML).toContain("&lt;img");
  });

  it("uses the success glyph for success toasts", () => {
    showToast("Done", "success");
    expect(document.body.textContent).toContain("✓");
  });

  it("uses the error glyph for error toasts", () => {
    showToast("Failed", "error");
    expect(document.body.textContent).toContain("✕");
  });

  it("fades out and removes itself after the configured duration", () => {
    showToast("Hello");

    // showToast appends one styled wrapper; the .windows95-border box is its
    // only child.
    const wrapper = document.body.lastElementChild;
    expect(wrapper).not.toBeNull();
    expect(document.body.querySelector(".windows95-border")).not.toBeNull();

    vi.advanceTimersByTime(999);
    expect(document.body.querySelector(".windows95-border")).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(wrapper?.getAttribute("style")).toContain("opacity: 0");

    vi.advanceTimersByTime(200);
    expect(document.body.querySelector(".windows95-border")).toBeNull();
  });
});
