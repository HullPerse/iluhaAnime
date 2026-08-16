import { Button } from "@/components/ui/button.component";
import { listStatusLabels } from "@/config/anilist.config";
import { useI18n } from "@/lib/i18n";
import type { AniListCollection } from "@/types/anilist";

interface Props {
  lists: AniListCollection[];
  currentList: string;
  onSelect: (name: string) => void;
  searchTerms: string;
  global: boolean;
}

export default function AniListTabs({
  lists,
  currentList,
  onSelect,
  searchTerms,
  global,
}: Props) {
  const { t } = useI18n();
  return (
    <section className="relative flex flex-row gap-1">
      {lists
        .filter((item) => item.entries.length > 0)

        .map((item) => {
          const isActive = currentList === item.name;

          return (
            <Button
              key={item.name}
              className={`windows95-text active:outline-text cursor-pointer px-3 py-0.5 active:outline-1 active:outline-offset-[-3px] active:outline-dotted ${
                isActive
                  ? "windows95-active-border border-b-transparent"
                  : "windows95-border bg-surface"
              }`}
              style={{
                top: isActive ? 0 : "2px",
                marginBottom: isActive ? "-2px" : undefined,
                zIndex: isActive ? 20 : 10,
              }}
              onClick={() => onSelect(item.name)}
              disabled={isActive}
            >
              {t(
                (listStatusLabels[item.name.toUpperCase()] ??
                  item.name) as never
              )}{" "}
              (
              {
                item.entries.filter((e) => {
                  if (!searchTerms.trim() || global) return true;

                  const query = searchTerms.toLowerCase();

                  return (
                    e.media.title.toLowerCase().includes(query) ||
                    e.media.titles.some((t) => t.toLowerCase().includes(query))
                  );
                }).length
              }
              )
            </Button>
          );
        })}
    </section>
  );
}
