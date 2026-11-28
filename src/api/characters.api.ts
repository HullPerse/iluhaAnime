import { tauriTransport } from "@/api/transport.api";
import { assertSchema } from "@/lib/core/system/invoke.utils";
import { CharactersSearchIndexSchema, CharactersViewSchema } from "@/schemas/characters.schema";
import type {
  CharactersSearchIndex,
  CharactersView,
  SubmittedAnswers,
} from "@/types/api/characters";
import * as z from "zod/mini";

/** Tier-free character and anime names for the typed guess fields. */
export async function charactersSearchIndex(): Promise<CharactersSearchIndex> {
  return assertSchema(
    await tauriTransport.call("daily_characters_search_index"),
    CharactersSearchIndexSchema
  );
}

/** Save a draft or atomically check the whole sheet once. */
export async function playCharacters(
  day: string,
  answers: SubmittedAnswers[] | null = null,
  submit = false
): Promise<CharactersView> {
  return assertSchema(
    await tauriTransport.call("daily_characters_play", { day, answers, submit }),
    CharactersViewSchema
  );
}

/** Return only image bytes; title-bearing source URLs stay in Rust. */
export async function characterPortrait(
  day: string,
  round: number,
  proxyUrl: string | null
): Promise<string> {
  return assertSchema(
    await tauriTransport.call("daily_characters_portrait", { day, round, proxyUrl }),
    z.string()
  );
}
