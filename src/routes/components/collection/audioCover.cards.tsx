import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const MOSAIC_WIDTH = 48;
const MOSAIC_HEIGHT = 27;
const MOSAIC_FRAME_MS = 90;

export default function AudioCover({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!video || !canvas || !context) return;

    const { width, height } = canvas;
    let frame = 0;
    let last = 0;
    let painted = false;

    const paint = (now: number) => {
      frame = requestAnimationFrame(paint);
      if (now - last < MOSAIC_FRAME_MS) return;
      last = now;
      if (video.readyState < 2 || video.videoWidth === 0) return;
      if (painted && video.paused) return;
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      context.drawImage(
        video,
        (video.videoWidth - sourceWidth) / 2,
        (video.videoHeight - sourceHeight) / 2,
        sourceWidth,
        sourceHeight,
        0,
        0,
        width,
        height
      );
      painted = true;
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [videoRef]);

  return (
    <div className="daily-audio-cover">
      <canvas
        ref={canvasRef}
        width={MOSAIC_WIDTH}
        height={MOSAIC_HEIGHT}
        className="daily-audio-mosaic"
        aria-hidden
      />
    </div>
  );
}
