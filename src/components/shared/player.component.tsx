import { Video, videoFeatures } from "@videojs/react/video";

import { createPlayer } from "@videojs/react";
import { Button } from "../ui/button.component";
import { X } from "lucide-react";

import Timeline from "./player/timeline.player";
import Controls from "./player/controls.player";
import { useRef } from "react";

const PlayerRoot = createPlayer({ features: videoFeatures });
const { Provider, Container } = PlayerRoot;

function Player({
  header,
  onClose,
  src,
}: {
  header: string;
  onClose: () => void;
  src: string;
}) {
  const containerRef = useRef(null);

  return (
    <Provider>
      <Container
        className="flex flex-col mr-1 windows95-active-border bg-primary outline-none"
        ref={containerRef}
      >
        <section className="flex flex-row items-center justify-between bg-secondary w-full p-1">
          <span className="text-white windows95-text font-bold line-clamp-1">
            {header}
          </span>
          <Button size="icon" className="size-4" onClick={onClose}>
            <X />
          </Button>
        </section>
        {src && (
          <>
            <section className="bg-black">
              <Video
                src={src}
                className="w-full max-h-[70vh]"
                controls={false}
              />
            </section>
            <Timeline />
            <Controls />
          </>
        )}
      </Container>
    </Provider>
  );
}

export default Player;
