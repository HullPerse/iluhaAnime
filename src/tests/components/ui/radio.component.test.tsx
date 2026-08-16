import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

import { Radio } from "@/components/ui/radio.component";

afterEach(cleanup);

describe("Radio", () => {
  it("toggles on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio checked={false} onChange={onChange} />);
    await user.click(screen.getByRole("radio"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("toggles with Space and Enter keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio checked={false} onChange={onChange} />);
    screen.getByRole("radio").focus();
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(true);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Radio checked={false} onChange={onChange} disabled />);
    const radio = screen.getByRole("radio");
    expect(radio.getAttribute("tabindex")).toBe("-1");
    await user.click(radio);
    expect(onChange).not.toHaveBeenCalled();
  });
});
