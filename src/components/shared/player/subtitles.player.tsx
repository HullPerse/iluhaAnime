import { useEffect, useRef } from "react";

function AssOverlay({
  src,
  videoEl,
  visible,
  delay,
}: {
  src: string;
  videoEl: HTMLVideoElement | null;
  visible: boolean;
  delay: number;
}) {
  const assRef = useRef<Awaited<import("assjs").default> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!videoEl || !src) return;

    const container = videoEl.parentElement;
    if (!container) return;
    container.style.position = "relative";

    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch(src);
        const text = await resp.text();
        if (cancelled || !mountedRef.current) return;

        assRef.current?.destroy();

        const { default: ASS } = await import("assjs");
        const ass = new ASS(text, videoEl, { container });
        ass.delay = delay;
        assRef.current = ass;
        if (visible) ass.show();
        else ass.hide();
      } catch {
        /* fail silently */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, videoEl]);

  useEffect(() => {
    if (assRef.current) {
      if (visible) assRef.current.show();
      else assRef.current.hide();
    }
  }, [visible]);

  useEffect(() => {
    if (assRef.current) {
      assRef.current.delay = delay;
    }
  }, [delay]);

  useEffect(() => {
    return () => {
      assRef.current?.destroy();
      assRef.current = null;
    };
  }, []);

  return null;
}

export default AssOverlay;
