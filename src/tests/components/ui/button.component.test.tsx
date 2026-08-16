import { render, screen } from "@testing-library/react";
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { SmallLoader } from "@/components/shared/loader.component";
import { Button } from "@/components/ui/button.component";

describe("Button", () => {
  it("defaults to type button so it cannot submit surrounding forms", () => {
    render(
      <form>
        <Button>Action</Button>
      </form>
    );

    expect(
      screen.getByRole("button", { name: "Action" }).getAttribute("type")
    ).toBe("button");
  });

  it("preserves an explicit submit type", () => {
    render(
      <form>
        <Button type="submit">Save</Button>
      </form>
    );

    expect(
      screen.getByRole("button", { name: "Save" }).getAttribute("type")
    ).toBe("submit");
  });

  it("marks small loaders with the persistent spinner class", () => {
    render(<SmallLoader />);

    const loader = screen.getByLabelText(/loading|загрузка/i);
    expect(loader.getAttribute("class")).toContain("animate-spin");
    expect(loader.getAttribute("class")).toContain("ui-loading-spinner");
  });
});
