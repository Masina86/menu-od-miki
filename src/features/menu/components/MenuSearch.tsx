import type { RefObject } from "react";
import { Search, X } from "lucide-react";

interface MenuSearchProps {
  query: string;
  placeholder: string;
  darkMode: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onClear: () => void;
}

export function MenuSearch({
  query,
  placeholder,
  darkMode,
  inputRef,
  onChange,
  onClear,
}: MenuSearchProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4 md:px-6">
      <div
        className={`flex min-h-12 items-center gap-3 rounded-2xl border px-4 shadow-sm transition-colors focus-within:ring-2 focus-within:ring-amber-500/50 ${
          darkMode
            ? "border-stone-700 bg-stone-800/80 text-stone-100"
            : "border-stone-200 bg-white/85 text-stone-900"
        }`}
      >
        <Search size={17} aria-hidden="true" className="shrink-0 opacity-60" />
        <label className="sr-only" htmlFor="menu-search">
          {placeholder}
        </label>
        <input
          ref={inputRef}
          id="menu-search"
          type="search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:opacity-50 ${
            darkMode ? "placeholder:text-stone-300" : "placeholder:text-stone-500"
          }`}
        />
        {query && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full opacity-60 transition hover:bg-black/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
