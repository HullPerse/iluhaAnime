import { useState, type ReactNode } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import { isTorrentLink } from "@/lib/session/chat.utils";
import type { ChatMark, ChatSegment } from "@/lib/session/chat.utils";

interface ChatMessageTextProps {
  segments: ChatSegment[];
  customEmoji: ReadonlyMap<string, string>;
  onTorrentLink: (token: string) => void;
}

function marksClass(marks: readonly ChatMark[]): string {
  const classes: string[] = [];
  if (marks.includes("bold")) classes.push("font-bold");
  if (marks.includes("italic")) classes.push("italic");
  if (marks.includes("strike")) classes.push("line-through");
  return classes.join(" ");
}

function Spoiler({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <span>{children}</span>;
  return (
    <span className="relative inline-block">
      <span aria-hidden className="invisible select-none">
        {children}
      </span>
      <button
        aria-label={t("lobby.chat.spoiler.show")}
        className="bg-text absolute inset-0 cursor-pointer"
        onClick={() => setRevealed(true)}
        title={t("lobby.chat.spoiler.show")}
        type="button"
      />
    </span>
  );
}

interface SegmentRun {
  marks: readonly ChatMark[];
  segments: ChatSegment[];
}

function groupRuns(segments: ChatSegment[]): SegmentRun[] {
  const runs: SegmentRun[] = [];
  for (const segment of segments) {
    const marks = segment.marks ?? [];
    const last = runs.at(-1);
    if (last !== undefined && sameMarks(last.marks, marks)) {
      last.segments.push(segment);
    } else {
      runs.push({ marks, segments: [segment] });
    }
  }
  return runs;
}

function sameMarks(a: readonly ChatMark[], b: readonly ChatMark[]): boolean {
  return a.length === b.length && a.every((mark) => b.includes(mark));
}

export function ChatMessageText({
  segments,
  customEmoji,
  onTorrentLink,
}: ChatMessageTextProps) {
  return (
    <>
      {groupRuns(segments).map((run, runIndex) => {
        const leaves = run.segments.map((segment, segmentIndex) =>
          renderLeaf(segment, segmentIndex, customEmoji, onTorrentLink)
        );
        const className = marksClass(run.marks);
        if (run.marks.includes("spoiler")) {
          return (
            <Spoiler key={runIndex}>
              {className.length > 0 ? (
                <span className={className}>{leaves}</span>
              ) : (
                leaves
              )}
            </Spoiler>
          );
        }
        if (className.length === 0) {
          return <span key={runIndex}>{leaves}</span>;
        }
        return (
          <span className={className} key={runIndex}>
            {leaves}
          </span>
        );
      })}
    </>
  );
}

function renderLeaf(
  segment: ChatSegment,
  key: number,
  customEmoji: ReadonlyMap<string, string>,
  onTorrentLink: (token: string) => void
): ReactNode {
  if (segment.kind === "link") {
    if (isTorrentLink(segment.value)) {
      return (
        <button
          className="text-highlight underline"
          key={key}
          onClick={() => onTorrentLink(segment.value)}
          type="button"
        >
          {segment.value}
        </button>
      );
    }
    return (
      <a
        className="text-highlight underline"
        href={segment.value}
        key={key}
        rel="noreferrer"
        target="_blank"
      >
        {segment.value}
      </a>
    );
  }
  if (segment.kind === "emoji") {
    const url = customEmoji.get(segment.value);
    if (url !== undefined) {
      return (
        <img
          alt={`:${segment.value}:`}
          className="inline-block size-4 align-[-0.25em]"
          key={key}
          src={url}
          title={`:${segment.value}:`}
        />
      );
    }
    return <span key={key}>{`:${segment.value}:`}</span>;
  }
  if (segment.kind === "mention") {
    return (
      <span className="windows95-active text-text px-0.5 font-bold" key={key}>
        {segment.value}
      </span>
    );
  }
  return <span key={key}>{segment.value}</span>;
}
