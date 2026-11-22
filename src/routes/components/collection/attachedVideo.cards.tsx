import { useMediaAttach } from "@videojs/react";
import { useCallback } from "react";
import type { ComponentPropsWithoutRef, RefObject } from "react";

export default function AttachedVideo({
  videoRef,
  ...props
}: ComponentPropsWithoutRef<"video"> & { videoRef: RefObject<HTMLVideoElement | null> }) {
  const setMedia = useMediaAttach();
  const attach = useCallback(
    (element: HTMLVideoElement | null) => {
      videoRef.current = element;

      if (element && typeof element.addEventListener === "function") setMedia?.(element);
    },
    [setMedia, videoRef]
  );

  return <video ref={attach} {...props} />;
}
