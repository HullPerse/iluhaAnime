export function MediainfoPanel({ mediainfo }: { mediainfo: string }) {
  return (
    <pre className="windows95-border bg-surface max-h-80 overflow-auto p-1.5 font-mono text-xs whitespace-pre-wrap">
      {mediainfo}
    </pre>
  );
}
