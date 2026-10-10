import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";

import Section from "@/components/shared/section.component";
import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";
import { attempt, reportBackgroundError } from "@/lib/utils/attempt.utils";
import type { DescriptionBlock } from "@/types/torrent";

function DescriptionSpoiler({
  index,
  title,
  body,
  open,
  onToggle,
}: {
  index: number;
  title: string;
  body: string;
  open: boolean;
  onToggle: (index: number) => void;
}) {
  return (
    <Section
      header={title || "…"}
      expanded={open}
      onExpand={() => onToggle(index)}
      className="bg-surface"
    >
      <SpoilerBody body={body} />
    </Section>
  );
}

function isKeyValueLine(line: string): boolean {
  return /^[^:]{1,48}\s*:\s*.+/.test(line);
}

function isEpisodeLine(line: string): boolean {
  return (
    /^\d{1,3}\s*[.)\]:-]/.test(line) ||
    /\.(mkv|mp4|avi|ts|m2ts)$/i.test(line) ||
    /сери[ия]/i.test(line)
  );
}

const EPISODE_PREFIX_RX = /^\d{1,3}\s*[.)\]:-]?\s*/;

function SpoilerBody({ body }: { body: string }) {
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

function DescriptionLink({ text, href }: { text: string; href: string }) {
  const open = async () => {
    const [, openError] = await attempt(openUrl(href));
    if (openError) reportBackgroundError("details.open-link", openError);
  };
  return (
    <button
      type="button"
      className="text-highlight cursor-pointer text-xs underline hover:brightness-110"
      onClick={() => open()}
      title={href}
    >
      {text}
    </button>
  );
}

export default function DescriptionBlocks({
  blocks,
  fallback,
  onZoom,
}: {
  blocks: DescriptionBlock[];
  fallback: string;
  onZoom: (url: string) => void;
}) {
  const { t } = useI18n();
  const [openSpoilers, setOpenSpoilers] = useState<ReadonlySet<number>>(new Set());
  const toggleSpoiler = (index: number) => {
    setOpenSpoilers((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };
  if (blocks.length === 0) {
    return (
      <p className="windows95-text max-h-64 overflow-y-auto text-xs wrap-break-word whitespace-pre-wrap">
        {fallback || t("search.details.no.description")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            return (
              <h4
                key={index}
                className="windows95-text mt-1 text-center text-sm font-bold wrap-break-word first:mt-0"
              >
                {block.text}
              </h4>
            );
          }
          case "field": {
            return (
              <p key={index} className="windows95-text text-xs wrap-break-word">
                <strong>{block.label}: </strong>
                {block.value}
              </p>
            );
          }
          case "image": {
            return (
              <button
                key={index}
                type="button"
                className="windows95-border mx-auto block max-w-full cursor-zoom-in p-0 hover:brightness-110"
                onClick={() => onZoom(block.src)}
                title={t("search.details.open.image")}
                aria-label={t("search.details.open.image")}
              >
                <ImageComponent
                  src={block.src}
                  alt=""
                  className="max-h-56 w-auto max-w-full"
                  type="contain"
                />
              </button>
            );
          }
          case "spoiler": {
            return (
              <DescriptionSpoiler
                key={index}
                index={index}
                title={block.title}
                body={block.body}
                open={openSpoilers.has(index)}
                onToggle={toggleSpoiler}
              />
            );
          }
          case "code": {
            return (
              <pre
                key={index}
                className="windows95-border bg-surface overflow-auto p-1.5 font-mono text-xs whitespace-pre-wrap"
              >
                {block.text}
              </pre>
            );
          }
          case "link": {
            return (
              <span key={index}>
                <DescriptionLink text={block.text} href={block.href} />
              </span>
            );
          }
          case "text": {
            return (
              <p key={index} className="windows95-text text-xs wrap-break-word whitespace-pre-wrap">
                {block.text}
              </p>
            );
          }
          default: {
            return null;
          }
        }
      })}
    </div>
  );
}
