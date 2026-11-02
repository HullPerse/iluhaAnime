import * as z from "zod/mini";

export const RemoteImageIdSchema = z.compile(z.object({ id: z.string() }));
export const AnimeStillsSchema = z.compile(z.array(z.object({ url: z.string() })));