import type { RosterCharacter } from "@/types/api/cards";

export function mergeRoster(
  base: readonly RosterCharacter[],
  extra: readonly RosterCharacter[]
): RosterCharacter[] {
  const seen = new Set<number>();

  return [...base, ...extra].filter((character) => {
    if (seen.has(character.entityId)) return false;
    seen.add(character.entityId);

    return true;
  });
}
