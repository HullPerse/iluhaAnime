import { useEffect } from "react";
import type { RefObject } from "react";

export function usePackIntroAnimation(
  enableAnimations: boolean,
  introMs: number,
  packRef: RefObject<HTMLButtonElement | null>,
  setIntroFinished: (finished: boolean) => void
) {
  useEffect(() => {
    setIntroFinished(false);

    if (!enableAnimations) {
      setIntroFinished(true);

      return;
    }

    const pack = packRef.current;

    if (pack === null || typeof pack.animate !== "function") {
      setIntroFinished(true);

      return;
    }

    let cancelled = false;
    const animation = pack.animate(
      [
        { offset: 0, opacity: 0, transform: "translateY(-140%) rotate(-5deg) scale(0.85)" },
        { offset: 0.08, opacity: 1, transform: "translateY(0) rotate(0deg) scale(1)" },
        { offset: 0.16, transform: "translateX(-5px) rotate(-1deg)" },
        { offset: 0.22, transform: "translateX(5px) rotate(1deg)" },
        { offset: 0.28, transform: "translateX(-4px) rotate(-0.5deg)" },
        { offset: 0.34, transform: "translateX(0) rotate(0deg)" },
        { offset: 0.46, transform: "scale(1.03)" },
        { offset: 0.56, transform: "scale(0.98)" },
        { offset: 0.64, opacity: 1, transform: "scale(1.1)" },
        { offset: 0.72, opacity: 0, transform: "scale(1.4)" },
        { offset: 1, opacity: 0, transform: "scale(1.4)" },
      ],
      { duration: introMs, easing: "ease-in-out" }
    );
    animation.finished
      .then(() => {
        if (!cancelled) setIntroFinished(true);

        return null;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      animation.cancel();
    };
  }, [enableAnimations, introMs, packRef, setIntroFinished]);
}
