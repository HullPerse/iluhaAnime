export function isKeyValueLine(line: string): boolean {
  return /^[^:]{1,48}\s*:\s*.+/.test(line);
}

export function isEpisodeLine(line: string): boolean {
  return (
    /^\d{1,3}\s*[.)\]:-]/.test(line) ||
    /\.(mkv|mp4|avi|ts|m2ts)$/i.test(line) ||
    /сери[ия]/i.test(line)
  );
}

export const EPISODE_PREFIX_RX = /^\d{1,3}\s*[.)\]:-]?\s*/;
