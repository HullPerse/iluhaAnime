import type { ViewChrome, ViewChromeInput } from "@/types/core/view";

export function resolveViewChrome(input: ViewChromeInput): ViewChrome {
  if (input.mode === "minimal") {
    return {
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: true,
      barsHidden: !input.barsVisible && !input.menuOpen,
    };
  }
  if (input.mode === "compact") {
    return {
      fullBleed: true,
      showHeader: false,
      bottom: "slim",
      barsAutoHide: false,
      barsHidden: false,
    };
  }
  const immersive = input.cinema || input.fullscreen;
  return {
    fullBleed: immersive,
    showHeader: true,
    bottom: "full",
    barsAutoHide: input.autoHide,
    barsHidden: immersive && input.autoHide && !input.barsVisible && !input.menuOpen,
  };
}
