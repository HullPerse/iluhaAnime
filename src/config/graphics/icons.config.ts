import * as z from "zod/mini";

import data from "./icons.data.json";

const IconsDataSchema = z.object({
  playerIcons: z.array(z.string()),
});

const parsed = IconsDataSchema.parse(data);

export const playerIcons = parsed.playerIcons;