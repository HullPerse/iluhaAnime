import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SpeedLimitForm from "@/routes/components/torrent/speed.torrent";

function renderSpeed(
  overrides: Partial<React.ComponentProps<typeof SpeedLimitForm>> = {}
) {
  const defaultProps = {
    dlInput: "",
    ulInput: "",
    dlLimit: null,
    ulLimit: null,
    onDlChange: vi.fn(),
    onUlChange: vi.fn(),
    onApply: vi.fn(),
  };
  return {
    ...render(<SpeedLimitForm {...defaultProps} {...overrides} />),
    props: defaultProps,
  };
}

function getApplyButton(container: HTMLElement): HTMLButtonElement {
  const section = container.querySelector("section")!;
  const buttons = Array.from(section.querySelectorAll("button"));
  return buttons.at(-1)!;
}

describe("SpeedLimitForm", () => {
  it("renders two number inputs for download and upload limits", () => {
    renderSpeed();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("disables the apply button when inputs match current limits", () => {
    const { container } = renderSpeed({
      dlInput: "100",
      ulInput: "50",
      dlLimit: 100,
      ulLimit: 50,
    });
    expect(getApplyButton(container).disabled).toBe(true);
  });

  it("enables the apply button when inputs differ from current limits", () => {
    const { container } = renderSpeed({
      dlInput: "200",
      ulInput: "50",
      dlLimit: 100,
      ulLimit: 50,
    });
    expect(getApplyButton(container).disabled).toBe(false);
  });

  it("enables the apply button when limits are null and inputs are non-empty", () => {
    const { container } = renderSpeed({
      dlInput: "100",
      ulInput: "",
      dlLimit: null,
      ulLimit: null,
    });
    expect(getApplyButton(container).disabled).toBe(false);
  });

  it("rejects non-numeric input", async () => {
    const user = userEvent.setup();
    const onDlChange = vi.fn();
    renderSpeed({ onDlChange });

    const input = screen.getAllByRole("spinbutton")[0];
    await user.type(input, "abc");

    expect(onDlChange).not.toHaveBeenCalled();
  });

  it("calls onApply when clicking the apply button", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { container } = renderSpeed({
      dlInput: "100",
      ulInput: "50",
      dlLimit: null,
      ulLimit: null,
      onApply,
    });

    await user.click(getApplyButton(container));

    expect(onApply).toHaveBeenCalledOnce();
  });
});
