import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { InlineAutocompleteInput } from "@/components/shared/autocomplete/input.autocomplete";
import { Button } from "@/components/ui/button.component";
import { useI18n } from "@/hooks/i18n.hook";
import type { AutocompleteInputProps } from "@/types/search/search";

export function MangaSearchField({
  onSearch,
  trailingAction,
  ...input
}: AutocompleteInputProps & { onSearch: () => void; trailingAction?: ReactNode }) {
  const { t } = useI18n();

  return (
    <form
      className="ui-toolbar ui-panel w-full flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <InlineAutocompleteInput {...input} className="h-9 font-bold" maxLength={150} />
      <span className="ui-toolbar-separator" aria-hidden />
      <Button
        type="submit"
        size="icon"
        aria-label={t("manga.search.submit")}
        title={t("manga.search.submit")}
      >
        <Search className="size-4" />
      </Button>
      {trailingAction && <span className="ui-toolbar-separator" aria-hidden />}
      {trailingAction}
    </form>
  );
}
