export type SubmittedAnswers = { character: string; anime: string };
export type CharacterField = { submitted: string; solved: boolean; answer: string | null };
export type CharacterRound = {
  tier: "easy" | "medium" | "hard";
  character: CharacterField;
  anime: CharacterField;
};
export type CharacterIndexEntry = { id: number; name: string; aliases: string[] };
export type CharactersSearchIndex = {
  characters: CharacterIndexEntry[];
  anime: CharacterIndexEntry[];
};
export type CharactersView = {
  day: string;
  rounds: CharacterRound[];
  correct: number;
  finished: boolean;
  rewardPackId: string | null;
};
