import * as z from "zod/mini";

const field = z.object({
  submitted: z.string(),
  solved: z.boolean(),
  answer: z.nullable(z.string()),
});
export const CharactersViewSchema = z.compile(
  z.object({
    day: z.string(),
    correct: z.number(),
    finished: z.boolean(),
    rewardPackId: z.nullable(z.string()),
    history: z.array(z.object({ day: z.string(), correct: z.number() })),
    rounds: z.array(
      z.object({ tier: z.enum(["easy", "medium", "hard"]), character: field, anime: field })
    ),
  })
);
