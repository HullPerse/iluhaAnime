import { buildVariantId } from "@/lib/player/streamHelpers.utils";
import type { DropdownOption } from "@/types/core/dropdown.tracks";
import type { StreamVariant } from "@/types/player/stream";

export function variantOptions(variants: StreamVariant[]): DropdownOption[] {
  return variants.map((variant) => ({
    value: buildVariantId(variant),
    main: variant.name,
    hint: variant.language || undefined,
  }));
}
