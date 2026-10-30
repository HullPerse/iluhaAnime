import { ReactElement } from "react";

import { useResolvedHotkeys } from "@/hooks/hotkeys.hook";
import { focusMainSearch } from "@/lib/focusHotkeys.utils";
import { useCell } from "@/lib/signal.hook";
import { settingsAtoms } from "@/store/settings.store";
import { SearchType } from "@/types/search";

import SearchDefault from "./components/search/default/index.search";
import SearchModern from "./components/search/modern/index.search";

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
