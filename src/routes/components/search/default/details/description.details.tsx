import { Fragment, useState } from "react";

import { useI18n } from "@/hooks/i18n.hook";
import type { DescriptionBlock } from "@/types/torrent/torrent";

import {
  renderDescriptionBlock,
  type DescriptionRenderContext,
} from "@/routes/components/search/default/details/descriptionBlocks.details";

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
  const renderContext: DescriptionRenderContext = {
    openImageLabel: t("search.details.open.image"),
    openSpoilers,
    handleToggleSpoiler: toggleSpoiler,
    onZoom,
  };
  return (
    <div className="flex flex-col gap-1">
      {blocks.map((block, index) => (
        <Fragment key={index}>{renderDescriptionBlock(block, index, renderContext)}</Fragment>
      ))}
    </div>
  );
}
