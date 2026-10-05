import type { AniMedia } from "@/types/anilist";

interface AnimeOptionRowProps {
  brief: AniMedia;
  /** Display title, already resolved through the title-language chain. */
  title: string;
  /** Keyboard or hover highlight. */
  highlighted: boolean;
  onPick: (id: number) => void;
}

/**
 * One inline-search result for the `@anime:` dropdown: cover thumb, title,
 * and a format/year hint. The parent owns the title chain and the list
 * navigation; the row only reports the pick.
 */
export default function AnimeOptionRow({
  brief,
  title,
  highlighted,
  onPick,
}: AnimeOptionRowProps) {
  const meta = [brief.format, brief.season_year]
    .filter((part) => part !== null)
    .join(" · ");
  return (
    <button
      aria-selected={highlighted}
      className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-xs ${
        highlighted ? "windows95-active" : ""
      }`}
      onClick={() => onPick(brief.id)}
      role="option"
      title={title}
      type="button"
    >
      {brief.cover_url !== null && brief.cover_url !== "" ? (
        <img
          alt=""
          className="h-10 w-7 shrink-0 border border-muted object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={brief.cover_url}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
      <span className="text-text min-w-0 flex-1 truncate">{title}</span>
      {meta !== "" && <span className="text-hint shrink-0">{meta}</span>}
    </button>
  );
}
