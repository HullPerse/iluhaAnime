import { FileText, Image as ImageIcon, Info, Link2, MessageSquare, Rss } from "lucide-react";

import { useI18n } from "@/hooks/i18n.hook";
import type { DetailsTabPanelsProps } from "@/types/core/detailsModal";

import DescriptionBlocks from "@/routes/components/search/default/details/description.details";
import { CommentsPanel } from "@/routes/components/search/default/details/panels/comments.panels";
import { FilesPanel } from "@/routes/components/search/default/details/panels/files.panels";
import { MediainfoPanel } from "@/routes/components/search/default/details/panels/mediainfo.panels";
import { ScreenshotsPanel } from "@/routes/components/search/default/details/panels/screenshots.panels";
import { DetailSection } from "@/routes/components/search/default/details/section.details";

export function DetailsTabPanels({
  view,
  activeTab,
  metadataFields,
  onZoom,
  onZoomScreenshot,
}: DetailsTabPanelsProps) {
  const { t } = useI18n();
  return (
    <>
      {activeTab === "description" && (
        <DetailSection
          icon={<Rss className="size-3" />}
          title={t("search.details.description")}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <DescriptionBlocks
            blocks={view.descriptionBlocks}
            fallback={view.description}
            onZoom={onZoom}
          />
        </DetailSection>
      )}

      {metadataFields.length > 0 && activeTab === "description" && (
        <DetailSection
          icon={<Info className="size-3" />}
          title={t("search.details.information")}
          count={metadataFields.length}
        >
          <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
            {metadataFields.map((field, index) => (
              <div
                key={`${field.label}-${index}`}
                className="windows95-border bg-surface min-w-0 px-1.5 py-1"
              >
                <div className="windows95-text text-hint text-xs">{field.label}</div>
                <div className="windows95-text mt-0.5 text-xs wrap-break-word whitespace-pre-wrap">
                  {field.value}
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {activeTab === "screenshots" && (
        <DetailSection
          icon={<ImageIcon className="size-3" />}
          title={t("search.details.screenshots")}
          count={view.screenshots.length}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <ScreenshotsPanel screenshots={view.screenshots} onZoom={onZoomScreenshot} />
        </DetailSection>
      )}

      {activeTab === "files" && (
        <DetailSection
          icon={<FileText className="size-3" />}
          title={t("search.details.files")}
          count={view.files.length}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <FilesPanel view={view} />
        </DetailSection>
      )}

      {activeTab === "mediainfo" && view.mediainfo && (
        <DetailSection
          icon={<Info className="size-3" />}
          title={t("search.details.mediainfo")}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <MediainfoPanel mediainfo={view.mediainfo} />
        </DetailSection>
      )}

      {activeTab === "comments" && (
        <DetailSection
          icon={<MessageSquare className="size-3" />}
          title={t("search.details.comments")}
          count={view.comments.length}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="min-h-0 flex-1 overflow-y-auto p-1.5"
        >
          <CommentsPanel view={view} />
        </DetailSection>
      )}

      {view.infoHash && (
        <DetailSection icon={<Link2 className="size-3" />} title={t("search.details.hash")}>
          <p className="windows95-text text-xs break-all">{view.infoHash}</p>
        </DetailSection>
      )}
    </>
  );
}
