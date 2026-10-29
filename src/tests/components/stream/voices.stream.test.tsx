import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StreamVoices from "@/routes/components/stream/voices.stream";
import { patchSettings } from "@/store/settings.store";
import type { StreamVariant } from "@/types/stream";

const VARIANTS: StreamVariant[] = [
  {
    id: "32416",
    name: "AniDUB",
    language: "Озвучка",
    separateStream: true,
    player: "Kodik",
    sourceUrl: "//kodikplayer.com/seria/1/hash/720p",
  },
  {
    id: "900",
    name: "RISE I voices",
    language: "Субтитры",
    separateStream: true,
    player: "Kodik",
    sourceUrl: "//kodikplayer.com/seria/2/hash/720p",
  },
];

function renderVoices(overrides: Partial<React.ComponentProps<typeof StreamVoices>> = {}) {
  return render(
    <StreamVoices
      variants={VARIANTS}
      isPending={false}
      error={null}
      selectedId="Kodik:32416"
      hasEpisode
      onPick={vi.fn()}
      onRetry={vi.fn()}
      {...overrides}
    />
  );
}

beforeEach(() => {
  patchSettings({ language: "en" });
});

afterEach(() => {
  cleanup();
});

describe("StreamVoices", () => {
  it("asks for an episode before showing voice-overs", () => {
    renderVoices({ hasEpisode: false, variants: [] });
    expect(screen.getByText("Pick an episode to see its voice-overs.")).toBeDefined();
  });

  it("marks the selected voice-over and reports a switch", () => {
    const onPick = vi.fn();
    renderVoices({ onPick });

    const selected = screen.getByText("AniDUB").closest("[aria-pressed]");
    expect(selected?.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByText("RISE I voices"));
    expect(onPick).toHaveBeenCalledWith(VARIANTS[1]);
  });

  it("shows one voice-over without a count", () => {
    renderVoices({ variants: [VARIANTS[0]] });
    expect(screen.getByText("AniDUB")).toBeDefined();
    expect(screen.queryByText("2")).toBeNull();
  });

  it("reports an episode without voice-overs", () => {
    renderVoices({ variants: [] });
    expect(screen.getByText("This episode has no voice-overs.")).toBeDefined();
  });

  it("shows a failed player request with a retry", () => {
    const onRetry = vi.fn();
    renderVoices({ variants: [], error: new Error("players failed"), onRetry });

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
