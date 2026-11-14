import ImageComponent from "@/components/ui/image.component";
import { useI18n } from "@/hooks/i18n.hook";

export default function MissingMediaCard({
  title,
  coverUrl,
  kind,
}: {
  title: string;
  coverUrl: string | null;
  kind: "anime" | "manga";
}) {
  const { t } = useI18n();
  return (
    <div className="cards-window cards-missing-media" data-testid="collection-main-missing">
      <div className="cards-window-bar" title={title}>
        <span>{title}</span>
      </div>
      <div className="cards-inner">
        <div className="cards-art">
          <ImageComponent
            src={coverUrl ?? ""}
            alt={title}
            type="cover"
            className="h-full w-full"
          />
        </div>
        <div className="cards-meta">
          <span className="cards-kind">{t(`collection.kind.${kind}`)}</span>
          <span className="cards-missing-label">{t("collection.silhouette.unknown")}</span>
        </div>
      </div>
    </div>
  );
}
