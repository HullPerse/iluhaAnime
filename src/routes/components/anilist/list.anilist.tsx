import type { AniListCollection } from "@/types/anilist";
import { Button } from "@/components/ui/button.component";
import { getListLabel } from "@/lib/anilist.utils";

interface Props {
  lists: AniListCollection[];
  currentList: string;
  onSelect: (name: string) => void;
}

export default function AniListTabs({ lists, currentList, onSelect }: Props) {
  return (
    <section className="relative flex flex-row gap-1">
      {lists
        .filter((item) => item.entries.length > 0)
        .map((item) => {
          const isActive = currentList === item.name;
          return (
            <Button
              key={item.name}
              className={`px-3 py-0.5 cursor-pointer windows95-text active:outline-dotted active:outline-1 active:outline-offset-[-3px] active:outline-text ${
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
              {getListLabel(item.name.toUpperCase()) ?? item.name} ({item.entries.length})
            </Button>
          );
        })}
    </section>
  );
}
