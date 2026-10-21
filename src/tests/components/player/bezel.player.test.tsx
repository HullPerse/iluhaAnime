import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PlayerBezel from "@/routes/components/player/bezel.player";

afterEach(cleanup);

describe("PlayerBezel", () => {
  it("renders a passive cabinet for the selected variant", () => {
    const { container } = render(<PlayerBezel variant="wood" />);
    const root = container.querySelector<HTMLElement>(".player-bezel");
    expect(root?.dataset.variant).toBe("wood");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelectorAll("button, a, input, select, [tabindex]")).toHaveLength(0);
    expect(container.querySelector(".player-bezel-screen")).not.toBeNull();
    expect(container.querySelector(".player-bezel-glare")).not.toBeNull();
    expect(container.querySelector(".player-bezel-led")).not.toBeNull();
  });

  it("marks the plastic variant separately", () => {
    const { container } = render(<PlayerBezel variant="win95" />);
    const root = container.querySelector<HTMLElement>(".player-bezel");
    expect(root?.dataset.variant).toBe("win95");
  });
});
