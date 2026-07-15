import { useMemo, useRef, useState } from "react";
import type { Category, Language } from "../../../../shared/types";
import {
  categoryMatchesSearch,
  normalizeSearchQuery,
} from "../../../lib/menu";

export function useMenuSearch(menu: Category[], language: Language) {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedSearchQuery = useMemo(
    () => normalizeSearchQuery(searchQuery),
    [searchQuery],
  );
  const hasSearchResults = useMemo(
    () =>
      !normalizedSearchQuery ||
      menu.some((category) =>
        categoryMatchesSearch(category, normalizedSearchQuery, language),
      ),
    [menu, normalizedSearchQuery, language],
  );

  return {
    searchQuery,
    setSearchQuery,
    searchInputRef,
    normalizedSearchQuery,
    hasSearchResults,
  };
}
