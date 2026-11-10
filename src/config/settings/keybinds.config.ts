import * as z from "zod/mini";

import type { KeybindAction, KeybindDef } from "@/types/ui/keybinds";
import type { ResolvedHotkeyDef } from "@/types/ui/hotkeys";
import data from "./keybinds.data.json";

const KeybindDefSchema = z.object({
  action: z.string(),
  category: z.string(),
  chord: z.string(),
  description: z.string(),
  keys: z.string(),
  repeat: z.string(),
});

const ResolvedHotkeySchema = z.object({
  chord: z.string(),
  id: z.string(),
  keybindId: z.string(),
  repeat: z.string(),
});

const KeybindsDataSchema = z.object({
  DIGIT_KEYS: z.array(z.number()),
  KEYBINDS: z.array(KeybindDefSchema),
  OFFSET_LIMIT: z.number(),
  OFFSET_STEP: z.number(),
  OFFSET_STEP_FINE: z.number(),
  PLAYER_HOTKEYS: z.array(ResolvedHotkeySchema),
  SEEK_STEP: z.number(),
  VIEW_MODE_DIGITS: z.array(z.number()),
});

const parsed = KeybindsDataSchema.parse(data);

export const SEEK_STEP = parsed.SEEK_STEP;
export const OFFSET_STEP = parsed.OFFSET_STEP;
export const OFFSET_STEP_FINE = parsed.OFFSET_STEP_FINE;
export const OFFSET_LIMIT = parsed.OFFSET_LIMIT;

export const DIGIT_KEYS = parsed.DIGIT_KEYS as unknown as readonly [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const VIEW_MODE_DIGITS = parsed.VIEW_MODE_DIGITS as readonly number[];

export const KEYBINDS = parsed.KEYBINDS as KeybindDef[];

export const PLAYER_HOTKEYS = parsed.PLAYER_HOTKEYS as ResolvedHotkeyDef<KeybindAction>[];
