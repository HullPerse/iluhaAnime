import ImageComponent from "@/components/ui/image.component";
import { enterOrSpace } from "@/lib/ui/keyboard.utils";
import type { FavouritePerson } from "@/types/anilist/anilist";

export function FavouritePersonRow({
  person,
  onSelect,
}: {
  person: FavouritePerson;
  onSelect: (person: FavouritePerson) => void;
}) {
  const activate = () => onSelect(person);
  return (
    <div
      className="windows95-active-border bg-primary hover:bg-surface flex flex-row items-center gap-2 p-1 hover:cursor-pointer"
      role="button"
      tabIndex={0}
      aria-label={person.name}
      onClick={activate}
      onKeyDown={enterOrSpace(activate)}
    >
      {person.image ? (
        <ImageComponent
          src={person.image}
          alt={person.name}
          className="windows95-active-border h-18 w-13 shrink-0"
        />
      ) : (
        <div className="windows95-active-border bg-field flex h-14 w-10 shrink-0 items-center justify-center text-xs">
          ?
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="windows95-text truncate text-xs font-bold" title={person.name}>
          {person.name}
        </span>
      </div>
    </div>
  );
}
