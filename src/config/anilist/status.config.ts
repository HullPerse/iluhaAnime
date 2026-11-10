import * as z from "zod/mini";

import data from "./statusBoost.data.json";

const StatusBoostSchema = z.record(z.string(), z.number());

export const ANIME_STATUS_BOOST: Record<string, number> = StatusBoostSchema.parse(data);
