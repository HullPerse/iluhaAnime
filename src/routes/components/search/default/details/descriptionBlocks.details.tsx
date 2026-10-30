import type { ReactNode } from "react";

import ImageComponent from "@/components/ui/image.component";
import type { DescriptionBlock } from "@/types/torrent/torrent";

import { DescriptionLink } from "@/routes/components/search/default/details/descriptionLink.details";
import { DescriptionSpoiler } from "@/routes/components/search/default/details/descriptionSpoiler.details";

export interface DescriptionRenderContext {
  openImageLabel: string;
  openSpoilers: ReadonlySet<number>;
  handleToggleSpoiler: (index: number) => void;
  onZoom: (url: string) => void;
}

type RenderBlock = (
  block: DescriptionBlock,
  index: number,
  context: DescriptionRenderContext
) => ReactNode;

const RENDERERS: Record<DescriptionBlock["kind"], RenderBlock> = {
  heading: (block) =>
    block.kind === "heading" && (
      <h4 className="windows95-text mt-1 text-center text-sm font-bold wrap-break-word first:mt-0">
        {block.text}
      </h4>
    ),
  field: (block) =>
    block.kind === "field" && (
      <p className="windows95-text text-xs wrap-break-word">
        <strong>{block.label}: </strong>
        {block.value}
      </p>
    ),
  image: (block, _index, context) =>
    block.kind === "image" && (
      <button
        type="button"
        className="windows95-border mx-auto block max-w-full cursor-zoom-in p-0 hover:brightness-110"
        onClick={() => context.onZoom(block.src)}
        title={context.openImageLabel}
        aria-label={context.openImageLabel}
      >
        <ImageComponent
          src={block.src}
          alt=""
          className="max-h-56 w-auto max-w-full"
          type="contain"
        />
      </button>
    ),
  spoiler: (block, index, context) =>
    block.kind === "spoiler" && (
      <DescriptionSpoiler
        index={index}
        title={block.title}
        body={block.body}
        open={context.openSpoilers.has(index)}
        onToggle={context.handleToggleSpoiler}
      />
    ),
  code: (block) =>
    block.kind === "code" && (
      <pre className="windows95-border bg-surface overflow-auto p-1.5 font-mono text-xs whitespace-pre-wrap">
        {block.text}
      </pre>
    ),
  link: (block) => block.kind === "link" && <DescriptionLink text={block.text} href={block.href} />,
  text: (block) =>
    block.kind === "text" && (
      <p className="windows95-text text-xs wrap-break-word whitespace-pre-wrap">{block.text}</p>
    ),
};

export const renderDescriptionBlock = (
  block: DescriptionBlock,
  index: number,
  context: DescriptionRenderContext
): ReactNode => {
  return RENDERERS[block.kind](block, index, context);
};
