import { useMediaAttach } from "@videojs/react";
import { useCallback } from "react";

export default function NativeVideo({ src, title }: { src: string; title?: string }) {
  const setMedia = useMediaAttach();
  const ref = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el || typeof el.addEventListener !== "function") return;
      setMedia?.(el);
    },
    [setMedia]
  );
  return <video src={src} title={title} ref={ref} className="h-full w-full" />;
}
