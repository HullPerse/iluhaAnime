import { ReactElement } from "react";

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

  return searchMap[searchType]();
}

export default SearchRoute;
