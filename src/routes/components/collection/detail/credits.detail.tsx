import { useState } from "react";

import Section from "@/components/shared/section.component";
import { useI18n } from "@/lib/locale/i18n.utils";
import type { CollectionItem } from "@/types/collection";

export function CreditsCollection({ item }: { item: CollectionItem }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const staff = item.detailsJson?.staff ?? [];
  const characters = item.detailsJson?.characters ?? [];
  if (staff.length === 0 && characters.length === 0) return null;
  return (
    <Section
      header={t("collection.details.credits")}
      expanded={expanded}
      onExpand={() => setExpanded((open) => !open)}
    >
      {staff.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {staff.slice(0, 30).map((person) => (
            <div key={person.id} className="flex gap-1 text-xs">
              <span className="min-w-0 flex-1 truncate font-bold">{person.name}</span>
              <span className="text-hint min-w-0 flex-1 truncate">{person.role}</span>
            </div>
          ))}
        </div>
      )}
      {characters.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {characters.map((character) => (
            <div key={character.id} className="flex gap-1 text-xs">
              <span className="min-w-0 flex-1 truncate font-bold">{character.name}</span>
              <span className="text-hint min-w-0 flex-1 truncate">
                {character.voiceActors.map((actor) => actor.name).join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
