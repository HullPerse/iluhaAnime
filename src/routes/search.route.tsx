import { ReactElement } from "react";

import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { focusMainSearch } from "@/lib/ui/focusHotkeys.utils";
import { useCell } from "@/lib/core/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import { SearchType } from "@/types/search/search";

import SearchDefault from "@/routes/components/search/default/index.search";
import SearchModern from "@/routes/components/search/modern/index.search";

const searchMap: Record<SearchType, () => ReactElement> = {
  default: () => <SearchDefault />,
  modern: () => <SearchModern />,
};

function SearchRoute() {
  const searchType = useCell(settingsAtoms.searchType);
  useResolvedHotkeys<"focus-main">(
    [{ id: "focus-main", chord: "ctrl+KeyK", repeat: "once", keybindId: "focus.main" }],
    {
      onAction: () => focusMainSearch(),
    }
  );

  return searchMap[searchType]();
}

export default SearchRoute;
