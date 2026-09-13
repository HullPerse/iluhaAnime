import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";

import { reportBackgroundError } from "@/lib/utils/attempt.utils";

import { Win95PlayerButton } from "./win95PlayerButton.video";

export function FullscreenToggle({
  iframeRef,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === iframeRef.current);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [iframeRef]);

  const toggle = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (fullscreen) {
      document
        .exitFullscreen?.()
        ?.catch((error) => reportBackgroundError("fullscreen.exit", error));
    } else {
      iframe
        .requestFullscreen?.()
        ?.catch((error) => reportBackgroundError("fullscreen.enter", error));
    }
  };

  return (
    <Win95PlayerButton onClick={toggle} aria-label="Fullscreen" title="Fullscreen">
      {fullscreen ? <Minimize className="size-3" /> : <Maximize className="size-3" />}
    </Win95PlayerButton>
  );
}
