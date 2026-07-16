import React, { useRef } from "react";
import type { Category, Language } from "../../../../shared/types";
import { getLangValue } from "../../../lib/menu";

interface CategoryNavProps {
  categories: Category[];
  language: Language;
  darkMode: boolean;
  activeId: number | null;
  onCategorySelect: (id: number) => void;
  onCategoryView: (category: Category) => void;
}

export function CategoryNav({
  categories,
  language,
  darkMode,
  activeId,
  onCategorySelect,
  onCategoryView,
}: CategoryNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = (category: Category) => {
    const id = category.id;
    onCategoryView(category);
    const element = document.getElementById(`cat-${id}`);
    if (element) {
      const top = element.getBoundingClientRect().top + window.scrollY - 104;
      onCategorySelect(id);
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      onCategorySelect(id);
    }
    scrollRef.current
      ?.querySelector(`[data-cat="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  if (categories.length < 2) return null;
  return (
    <div
      className={`sticky top-0 z-40 border-b backdrop-blur-xl ${
        darkMode
          ? "bg-stone-900/90 border-stone-700"
          : "bg-white/90 border-stone-100"
      }`}
    >
      <div
        ref={scrollRef}
        className="flex justify-start md:justify-center overflow-x-scroll overflow-y-hidden gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 md:py-2 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", scrollbarGutter: "stable" } as React.CSSProperties}
      >
        {categories.map((category) => {
          const active = activeId === category.id;
          const name = getLangValue(category, "name", language);
          return (
            <button
              key={category.id}
              data-cat={category.id}
              type="button"
              onClick={() => scrollTo(category)}
              aria-current={active ? "true" : undefined}
              title={name}
              className={`min-h-8 md:min-h-11 flex-shrink-0 rounded-full px-3 md:px-4 py-1 md:py-2 border text-[10px] md:text-xs font-bold uppercase tracking-wide md:tracking-wider transition-colors whitespace-nowrap ${
                active
                  ? darkMode
                    ? "bg-stone-100 text-stone-900 border-stone-100 shadow-sm"
                    : "bg-stone-900 text-white border-stone-900 shadow-sm"
                  : darkMode
                    ? "text-stone-400 border-stone-800 hover:text-stone-100 hover:border-stone-600"
                    : "text-stone-500 border-stone-200 hover:text-stone-900 hover:border-stone-300"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
