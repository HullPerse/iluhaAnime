import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DidYouMeanRow from "@/routes/components/search/didyoumean.search";
import { useSettingsStore } from "@/store/settings.store";

afterEach(() => cleanup());

beforeEach(() => {
  useSettingsStore.setState({ language: "en" });
});

function renderRow(props = {}) {
  return render(
    <DidYouMeanRow
      correction="frieren"
      loading={false}
      resultCount={0}
      onPick={() => {}}
      {...props}
    />
  );
}

describe("DidYouMeanRow", () => {
  it("picks the correction on click", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<DidYouMeanRow correction="frieren" loading={false} resultCount={0} onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: /Did you mean/ }));

    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("stays hidden without a correction, while loading, or with results", () => {
    const { container, rerender } = renderRow();
    expect(container.textContent).toContain("frieren");

    rerender(<DidYouMeanRow correction={null} loading={false} resultCount={0} onPick={() => {}} />);
    expect(container.textContent).toBe("");

    rerender(<DidYouMeanRow correction="frieren" loading resultCount={0} onPick={() => {}} />);
    expect(container.textContent).toBe("");

    rerender(
      <DidYouMeanRow correction="frieren" loading={false} resultCount={3} onPick={() => {}} />
    );
    expect(container.textContent).toBe("");
  });
});
