import { ReactElement } from "react";

import { useSettingsStore } from "@/store/settings.store";
import { SearchType } from "@/types/search";

import SearchDefault from "./components/search/default/index.search";
import SearchModern from "./components/search/modern/index.search";

const searchMap: Record<SearchType, () => ReactElement> = {
  default: () => <SearchDefault />,
  modern: () => <SearchModern />,
};

function SearchRoute() {
  const searchType = useSettingsStore((state) => state.searchType);

  return searchMap[searchType]();
}

export default SearchRoute;
