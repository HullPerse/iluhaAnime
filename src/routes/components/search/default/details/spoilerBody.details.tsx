import { isKeyValueLine, isEpisodeLine, EPISODE_PREFIX_RX } from "@/lib/torrent/description.utils";

export function SpoilerBody({ body }: { body: string }) {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length >= 2 && lines.filter(isKeyValueLine).length / lines.length >= 0.6) {
    return (
      <div className="flex flex-col">
        {lines.map((line, lineIndex) => {
          const separator = line.indexOf(":");
          return (
            <p key={lineIndex} className="windows95-text text-xs wrap-break-word odd:bg-black/5">
              <strong>{line.slice(0, separator).trim()}: </strong>
              {line.slice(separator + 1).trim()}
            </p>
          );
        })}
      </div>
    );
  }
  if (lines.length >= 3 && lines.filter(isEpisodeLine).length / lines.length >= 0.5) {
    return (
      <div className="flex flex-col">
        {lines.map((line, lineIndex) => {
          const badge = line.match(/^\d+/)?.[0] ?? String(lineIndex + 1).padStart(2, "0");
          const text = line.replace(EPISODE_PREFIX_RX, "") || line;
          return (
            <div key={lineIndex} className="flex items-center gap-1 odd:bg-black/5">
              <span className="windows95-border bg-surface text-hint shrink-0 px-1 font-mono text-xs">
                {badge}
              </span>
              <span className="windows95-text min-w-0 flex-1 truncate text-xs" title={line}>
                {text}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <p className="windows95-text max-h-64 overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap">
      {body}
    </p>
  );
}
