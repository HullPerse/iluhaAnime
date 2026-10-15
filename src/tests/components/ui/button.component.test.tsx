import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button.component";
import { patchSettings } from "@/store/settings.store";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Button loading", () => {
  it("renders children when not loading", () => {
    patchSettings({ language: "en" });
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("replaces children with a spinner and locks the button when loading", () => {
    patchSettings({ language: "en" });
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    const button = screen.getByRole("button", { name: "Loading" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".ui-loading-spinner")).not.toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps an explicit disabled when not loading", () => {
    patchSettings({ language: "en" });
    render(<Button disabled>Save</Button>);
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders nothing when rendered is false even while loading", () => {
    patchSettings({ language: "en" });
    const { container } = render(
      <Button rendered={false} loading>
        Save
      </Button>
    );
    expect(container.firstChild).toBeNull();
  });
});
