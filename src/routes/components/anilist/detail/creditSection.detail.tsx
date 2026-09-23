import { PosterTile } from "@/components/shared/posterTile.component";
import Section from "@/components/shared/section.component";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/lib/locale/i18n.utils";

export type CreditItem = {
  id: number;
  image: string | null;
  label: string;
  sublabel?: string;
  favourite?: boolean;
};

export function CreditSection({
  header,
  items,
  emptyLabel,
  hasNextPage = false,
  isFetchingNextPage = false,
  onShowMore,
  onSelect,
}: {
  header: string;
  items: CreditItem[];
  emptyLabel?: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onShowMore?: () => void;
  onSelect: (item: CreditItem) => void;
}) {
  const { t } = useI18n();
  const empty = items.length === 0 && emptyLabel !== undefined;

  return (
    <Section header={header} className="bg-field flex flex-col gap-1">
      {empty ? (
        <span className="windows95-text text-hint text-xs">{emptyLabel}</span>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <PosterTile
                key={item.id}
                size="lg"
                src={item.image}
                label={item.label}
                alt={item.label}
                sublabel={item.sublabel}
                favourite={item.favourite ?? false}
                onSelect={() => onSelect(item)}
              />
            ))}
          </div>
          {hasNextPage && (
            <Button
              className="windows95-text self-start px-1 py-0.5 text-xs"
              disabled={isFetchingNextPage}
              onClick={onShowMore}
            >
              {t("anilist.characters.show.more")}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}
