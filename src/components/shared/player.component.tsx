import { Video, videoFeatures } from "@videojs/react/video";

import { createPlayer } from "@videojs/react";

import Timeline from "./player/timeline.player";
import Controls from "./player/controls.player";
import Header from "./player/header.player";

const PlayerRoot = createPlayer({ features: videoFeatures });
const { Provider, Container } = PlayerRoot;

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
