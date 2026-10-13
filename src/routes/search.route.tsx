import { ReactElement } from "react";

import { useHotkeys } from "@/hooks/hotkeys.hook";
import { focusMainSearch } from "@/lib/hotkeys/focus.hotkeys";
import { useCell } from "@/lib/state/signal.hook";
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
  useHotkeys<"focus-main">([{ id: "focus-main", chord: "ctrl+KeyK", repeat: "once" }], {
    onAction: () => focusMainSearch(),
  });

  return searchMap[searchType]();
}

export default SearchRoute;
