import * as z from "zod/mini";

import data from "./sizeMultipliers.data.json";

const SizeMultipliersSchema = z.record(z.string(), z.number());

export const SIZE_MULTIPLIERS = SizeMultipliersSchema.parse(data);