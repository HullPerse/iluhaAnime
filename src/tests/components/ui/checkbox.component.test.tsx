import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

import { Checkbox } from "@/components/ui/checkbox.component";

afterEach(cleanup);

describe("Checkbox", () => {
  it("reports checked state on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports unchecked state when clicked while checked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={true} onChange={onChange} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not fire when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} disabled />);
    await user.click(screen.getByRole("checkbox"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
