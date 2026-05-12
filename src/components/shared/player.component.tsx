import { Video, videoFeatures } from "@videojs/react/video";

import {
  createPlayer,
  selectPlayback,
  selectTime,
  selectVolume,
  usePlayer,
} from "@videojs/react";
import { useEffect } from "react";

import Timeline from "./player/timeline.player";
import Controls from "./player/controls.player";
import Header from "./player/header.player";

const PlayerRoot = createPlayer({ features: videoFeatures });
const { Provider, Container } = PlayerRoot;

function PlayerKeyboard() {
  const playback = usePlayer(selectPlayback);
  const time = usePlayer(selectTime);
  const volume = usePlayer(selectVolume);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.code) {
        case "Space": {
          e.preventDefault();
          if (playback?.paused) playback?.play();
          else playback?.pause();
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const ct = time?.currentTime ?? 0;
          const dur = time?.duration ?? 0;
          time?.seek?.(Math.min(ct + 5, dur));
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const ct = time?.currentTime ?? 0;
          time?.seek?.(Math.max(ct - 5, 0));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const v = volume?.volume ?? 0;
          volume?.setVolume?.(Math.min(v + 0.01, 1));
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const v = volume?.volume ?? 0;
          volume?.setVolume?.(Math.max(v - 0.01, 0));
          break;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      e.preventDefault();
      const v = volume?.volume ?? 0;
      if (e.deltaY < 0) volume?.setVolume?.(Math.min(v + 0.01, 1));
      else volume?.setVolume?.(Math.max(v - 0.01, 0));
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [playback, time, volume]);

  return null;
}

function Player({
  header,
  onClose,
  src,
  chapters,
}: {
  header: string;
  onClose: () => void;
  src: string;
  chapters?: { start_time: number; end_time: number; title: string }[];
}) {
  return (
    <Provider>
      <Container className="flex flex-col h-full mr-1 windows95-active-border bg-primary outline-none">
        <Header header={header} onClose={onClose} />
        {src && (
          <>
            <PlayerKeyboard />
            <section className="flex-1 min-h-0 bg-black overflow-hidden">
              <Video
                src={src}
                className="h-full w-full object-contain"
                controls={false}
                preload="metadata"
              />
            </section>
            <Timeline chapters={chapters} />
            <Controls chapters={chapters} />
          </>
        )}
      </Container>
    </Provider>
  );
}

export default Player;
