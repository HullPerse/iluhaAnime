import { Fragment } from "react";
import type { MangaPersonRole } from "@/api/manga.api";

export function DetailPeople({
  label,
  people,
  keys,
  role,
  searchLabel,
  onSearch,
}: {
  label: string;
  people: string[];
  keys?: string[];
  role: MangaPersonRole;
  searchLabel: string;
  onSearch: (value: string, key?: string) => void;
}) {
  const unique = new Map<string, string>();

  for (const [index, person] of people.entries()) {
    const name = person.trim();

    if (name && !unique.has(name)) unique.set(name, keys?.[index] ?? "");
  }

  if (unique.size === 0) return null;

  return (
    <dl className="flex flex-wrap items-center gap-x-2">
      <dt className="text-hint">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-1 wrap-anywhere" data-role={role}>
        {[...unique.entries()].map(([person, key], index) => (
          <Fragment key={person}>
            {index > 0 && <span aria-hidden>,</span>}
            <button
              type="button"
              className="windows95-text text-text cursor-pointer border-0 bg-transparent p-0 text-left leading-tight whitespace-normal hover:underline"
              onClick={() => onSearch(person, key || undefined)}
              title={searchLabel}
            >
              {person}
            </button>
          </Fragment>
        ))}
      </dd>
    </dl>
  );
}
