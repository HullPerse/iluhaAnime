const READER_AUTO_SCROLL_BASE_PX_PER_SECOND = 120;

export function readerAutoScrollStep(dt: number, speed: number): number {
  return (dt / 1000) * speed * READER_AUTO_SCROLL_BASE_PX_PER_SECOND;
}

export type AutoClock = { elapsed: number; boundary: number };

export function advanceAutoClock(
  clock: AutoClock,
  options: {
    dt: number;
    end: boolean;
    bottom: boolean;
    interval: number;
    pause: number;
    autoNext: boolean;
    hasNext: boolean;
  }
): "scroll" | "turn" | "next" | "stop" | "wait" {
  if (!options.bottom) {
    clock.elapsed = 0;
    clock.boundary = 0;

    return "scroll";
  }

  clock.elapsed += options.dt;

  if (options.end) {
    if (!options.autoNext || !options.hasNext) return "stop";
    clock.boundary += options.dt;

    return clock.boundary >= options.pause * 1000 ? "next" : "wait";
  }

  clock.boundary = 0;

  if (clock.elapsed < options.interval * 1000) return "wait";
  clock.elapsed = 0;

  return "turn";
}

function imageLoaded(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

function imageVisible(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
}

export function readerImagesLoaded(node: HTMLElement | null): boolean {
  if (!node) return false;
  const images = [...node.querySelectorAll<HTMLImageElement>("[data-manga-image]")].filter(
    (image) => !image.closest('[aria-hidden="true"], [inert]')
  );

  if (images.length === 0) return false;
  const middle = window.innerHeight / 2;
  const centered = images.find((image) => {
    const rect = image.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0 && rect.top <= middle && rect.bottom >= middle;
  });

  if (centered) return imageLoaded(centered);
  const visible = images.filter(imageVisible);

  if (visible.length > 0) return visible.every(imageLoaded);

  return images.every(imageLoaded);
}

const READER_WHEEL_IGNORE = "[data-reader-ui], [data-no-wheel], [role=dialog], [role=menu]";

export function shouldForwardReaderWheel(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(READER_WHEEL_IGNORE) === null;
}
