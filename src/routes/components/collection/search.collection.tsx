import { X } from "lucide-react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete.component";
import { useI18n } from "@/lib/i18n";
import { SearchField } from "@/types/collection";

export default function SearchCollection({
  searchQuery,
  onSearchChange,
  field,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  field: SearchField;
}) {
  const { t } = useI18n();

  return (
    <main className="windows95-border flex items-center gap-1 bg-white px-1">
      <InlineAutocompleteInput
        placeholder={t("collection.search.title")}
        className="h-9 font-bold"
        {...field.inputProps}
      />
      {searchQuery && (
        <button type="button" onClick={() => onSearchChange("")} className="p-0.5">
          <X className="size-3" />
        </button>
      )}
    </main>
  );
}
