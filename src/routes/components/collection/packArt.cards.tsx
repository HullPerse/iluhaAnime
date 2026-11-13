import { Star } from "lucide-react";
import { cn } from "cn";

import { packLabelKey } from "@/config/cards/labels.config";
import { useI18n } from "@/hooks/i18n.hook";

export default function PackArt({
  packKind,
  size,
  className,
}: {
  packKind: string;
  size: number;
  className?: string;
}) {
  const { t } = useI18n();
  const label = t(packLabelKey(packKind));

  return (
    <div
      className={cn("cards-booster-shell select-none", `cards-booster-${packKind}`, className)}
      data-card-face
      data-pack-kind={packKind}
      data-tilt="pack"
      role="img"
      aria-label={label}
    >
      <div className="cards-booster">
        <span className="cards-booster-band" aria-hidden />
        <span className="cards-booster-crimp cards-booster-crimp-top" aria-hidden />
        <span className="cards-booster-crimp cards-booster-crimp-bottom" aria-hidden />
        <span className="cards-booster-brand" aria-hidden>
          iluhaanime
        </span>
        <span className="cards-booster-fan" aria-hidden>
          <span className="cards-booster-mini cards-booster-mini-left">
            <Star className="cards-booster-mini-mark" fill="currentColor" strokeWidth={1.4} />
          </span>
          <span className="cards-booster-mini cards-booster-mini-center">
            <Star className="cards-booster-mini-mark" fill="currentColor" strokeWidth={1.4} />
          </span>
          <span className="cards-booster-mini cards-booster-mini-right">
            <Star className="cards-booster-mini-mark" fill="currentColor" strokeWidth={1.4} />
          </span>
        </span>
        <span className="cards-booster-name">{label}</span>
        <span className="cards-booster-count">{t("collection.packs.count", { size })}</span>
      </div>
    </div>
  );
}
