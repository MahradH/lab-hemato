import { Search, Star, X } from "lucide-react";
import type { Category, FilterMode } from "../types";
import { faNum } from "../utils/number";

interface ToolbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  filter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  categories: Category[];
  totalCount: number;
  highlightedCount: number;
  filteredCount: number;
}

export function Toolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  category,
  onCategoryChange,
  categories,
  totalCount,
  highlightedCount,
  filteredCount,
}: ToolbarProps) {
  return (
    <>
      <div className="toolbar">
        <div className="search-field" role="search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="جستجو در نام یا توضیح یافته‌ها…"
            aria-label="جستجوی کارت‌ها"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => onQueryChange("")}
              aria-label="پاک کردن جستجو"
            >
              <X size={15} aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="filter-group" role="group" aria-label="انتخاب مجموعه مرور">
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => onFilterChange("all")}
            disabled={!totalCount}
          >
            همه تصاویر
            <span className="count-pill">{faNum(totalCount)}</span>
          </button>
          <button
            type="button"
            aria-pressed={filter === "highlighted"}
            onClick={() => onFilterChange("highlighted")}
            disabled={!totalCount}
          >
            <Star size={14} aria-hidden="true" />
            هایلایت‌شده‌ها
            <span className="count-pill">{faNum(highlightedCount)}</span>
          </button>
        </div>
      </div>

      <div className="category-row">
        <div className="chips" role="group" aria-label="دسته‌بندی یافته‌ها">
          <button
            type="button"
            className="chip"
            aria-pressed={category === "all"}
            onClick={() => onCategoryChange("all")}
          >
            همه دسته‌ها
          </button>
          {categories.map((item) => (
            <button
              type="button"
              key={item.id}
              className="chip"
              aria-pressed={category === item.id}
              onClick={() => onCategoryChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="result-count" aria-live="polite">
          {faNum(filteredCount)} کارت
        </span>
      </div>
    </>
  );
}
