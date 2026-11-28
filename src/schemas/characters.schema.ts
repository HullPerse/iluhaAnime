import * as z from "zod/mini";

const field = z.object({
  submitted: z.string(),
  solved: z.boolean(),
  answer: z.nullable(z.string()),
});
const indexEntry = z.object({ id: z.number(), name: z.string(), aliases: z.array(z.string()) });
export const CharactersSearchIndexSchema = z.compile(
  z.object({ characters: z.array(indexEntry), anime: z.array(indexEntry) })
);
export const CharactersViewSchema = z.compile(
  z.object({
    day: z.string(),
    correct: z.number(),
    finished: z.boolean(),
    rewardPackId: z.nullable(z.string()),
    rounds: z.array(
      z.object({ tier: z.enum(["easy", "medium", "hard"]), character: field, anime: field })
    ),
  })
);
