import type { TranslationKey } from "@/types/core/i18n";

type Translate = (key: TranslationKey) => string;

/** Turns the Rust error classes and validation failures into one short message. */
export function newsErrorText(error: unknown, t: Translate): string {
  if (error === null || error === undefined) return "";
  if (error instanceof Error && error.name === "ZodError") return t("news.error.badShape");
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("blocked:")) return t("news.error.blocked");
  if (message.startsWith("bad-shape:")) return t("news.error.badShape");
  if (message.startsWith("unreachable:")) return t("news.error.unreachable");
  return message;
}
