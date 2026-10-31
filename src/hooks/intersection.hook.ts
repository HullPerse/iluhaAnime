import { useEffect, useRef, useState } from "react";

export function useOnScreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState<boolean>(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const root = element.closest("[data-playlist-scroll]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: root instanceof Element ? root : null, rootMargin: "256px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, visible] as const;
}
