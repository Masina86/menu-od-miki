import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Restaurant,
  Category,
  Product,
  Language,
  LogoFit,
  AllergenKey,
  ALLERGEN_ICONS,
  ALLERGEN_LABELS,
} from "../types";
import { ImageModal } from "./ImageModal";
import { AllergenBadge } from "./AllergenIcons";
import {
  Maximize2,
  Settings,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Wifi,
  Phone,
  MapPin,
  Moon,
  Sun,
  Star,
  Sparkles,
  AlertCircle,
  Clock,
  Send,
  MessageSquarePlus,
  X,
} from "lucide-react";

const DEFAULT_LOGO_SIZE = 100;
const MIN_LOGO_SIZE = 60;
const MAX_LOGO_SIZE = 180;
const DEFAULT_LOGO_POSITION = 50;

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

const normalizeLogoFit = (value: unknown): LogoFit =>
  value === "cover" ? "cover" : "contain";

// ─── Translations ───────────────────────────────────────────────────────────

const TRANSLATIONS: Record<string, Record<Language, string>> = {
  additions: { MK: "Додатоци", BG: "Добавки", EN: "Additions" },
  currency: { MK: "ден.", BG: "ДЕН.", EN: "DEN." },
  welcome: { MK: "Добредојдовте во", BG: "Добре дошли в", EN: "Welcome to" },
  updated: {
    MK: "Нашето мени моментално се ажурира.",
    BG: "Нашето меню се актуализира в момента.",
    EN: "Our menu is currently being updated.",
  },
  powered: { MK: "Овозможено од", BG: "Поддържано от", EN: "Powered by" },
  back_to_admin: {
    MK: "Назад до Админ",
    BG: "Назад към Админ",
    EN: "Back to Admin",
  },
  search_placeholder: {
    MK: "Пребарај јадења...",
    BG: "Търсене на ястия...",
    EN: "Search dishes...",
  },
  no_results: {
    MK: "Нема резултати за",
    BG: "Няма резултати за",
    EN: "No results for",
  },
  sold_out: { MK: "Распродадено", BG: "Изчерпано", EN: "Sold Out" },
  featured: { MK: "Популарно", BG: "Популярно", EN: "Popular" },
  new_item: { MK: "Ново", BG: "Ново", EN: "New" },
  wifi: { MK: "WiFi лозинка", BG: "WiFi парола", EN: "WiFi Password" },
  allergens: { MK: "Алергени", BG: "Алергени", EN: "Allergens" },
  calories_unit: { MK: "kcal", BG: "kcal", EN: "kcal" },
  all_categories: { MK: "Сите", BG: "Всички", EN: "All" },
  reviews: { MK: "Рецензии", BG: "Отзиви", EN: "Reviews" },
  write_review: {
    MK: "Напишете рецензија",
    BG: "Напишете отзив",
    EN: "Write a Review",
  },
};

const t = (key: string, lang: Language): string =>
  TRANSLATIONS[key]?.[lang] || key;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getLangValue = (obj: any, field: string, lang: Language): string => {
  const dbValue =
    lang === "EN"
      ? obj[`${field}_en`]
      : lang === "BG"
        ? obj[`${field}_bg`]
        : obj[field];
  if (dbValue && String(dbValue).trim() !== "") return dbValue;

  const autoTrans: Record<string, Record<Language, string>> = {
    салати: { EN: "Salads", BG: "Салати", MK: "Салати" },
    предјадења: { EN: "Appetizers", BG: "Предястия", MK: "Предјадења" },
    десерти: { EN: "Desserts", BG: "Десерти", MK: "Десерти" },
    пијалоци: { EN: "Drinks", BG: "Напитки", MK: "Пијалоци" },
    "главни јадења": {
      EN: "Main Course",
      BG: "Основни ястия",
      MK: "Главни јадења",
    },
    скара: { EN: "Grill", BG: "Скара", MK: "Скара" },
    пици: { EN: "Pizzas", BG: "Пици", MK: "Пици" },
    паста: { EN: "Pasta", BG: "Паста", MK: "Паста" },
  };

  const originalValue = (obj[field] || "").toLowerCase().trim();
  return autoTrans[originalValue]?.[lang] || obj[field] || "";
};

const isMissingTranslation = (obj: any, field: string, lang: Language) => {
  if (lang === "MK") return false;
  const translated =
    lang === "EN"
      ? obj[`${field}_en`]
      : lang === "BG"
        ? obj[`${field}_bg`]
        : "";
  const translatedOk = translated && String(translated).trim() !== "";
  const baseOk = obj[field] && String(obj[field]).trim() !== "";
  return baseOk && !translatedOk;
};

const hasText = (value?: string | null) =>
  !!value && String(value).trim() !== "";

const hasMenuContentForLanguage = (
  categories: Category[],
  lang: Exclude<Language, "MK">,
): boolean => {
  const suffix = lang === "EN" ? "_en" : "_bg";

  const categoryHasText = (category: Category): boolean => {
    if (hasText(category[`name${suffix}` as keyof Category] as string)) {
      return true;
    }

    const productHasText = category.products.some((product) => {
      if (
        hasText(product[`name${suffix}` as keyof Product] as string) ||
        hasText(product[`description${suffix}` as keyof Product] as string)
      ) {
        return true;
      }

      return (product.additions || []).some((addition) =>
        hasText(addition[`name${suffix}` as keyof typeof addition] as string),
      );
    });

    return (
      productHasText || (category.subcategories || []).some(categoryHasText)
    );
  };

  return categories.some(categoryHasText);
};

const getAllergenList = (allergens?: string): AllergenKey[] => {
  if (!allergens) return [];
  return allergens
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean) as AllergenKey[];
};

const getTagList = (tags?: string): string[] => {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
};

const normalizeSearchQuery = (query: string) => query.trim().toLowerCase();

const productMatchesSearch = (
  product: Product,
  query: string,
  language: Language,
) =>
  getLangValue(product, "name", language).toLowerCase().includes(query) ||
  getLangValue(product, "description", language)
    .toLowerCase()
    .includes(query) ||
  getTagList(product.tags).some((tag) => tag.toLowerCase().includes(query));

const categoryMatchesSearch = (
  category: Category,
  query: string,
  language: Language,
): boolean =>
  getLangValue(category, "name", language).toLowerCase().includes(query) ||
  category.products.some((product) =>
    productMatchesSearch(product, query, language),
  ) ||
  (category.subcategories?.some((sub) =>
    categoryMatchesSearch(sub, query, language),
  ) ??
    false);

// ─── Dietary Badge ───────────────────────────────────────────────────────────

const DietaryBadge: React.FC<{ tag: string }> = ({ tag }) => {
  const config: Record<string, { emoji: string; color: string }> = {
    vegan: {
      emoji: "🌱",
      color: "bg-green-100 text-green-700 border-green-200",
    },
    vegetarian: {
      emoji: "🥗",
      color: "bg-lime-100 text-lime-700 border-lime-200",
    },
    spicy: { emoji: "🌶️", color: "bg-red-100 text-red-700 border-red-200" },
    "gluten-free": {
      emoji: "🚫🌾",
      color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    },
    halal: {
      emoji: "☪️",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    popular: {
      emoji: "⭐",
      color: "bg-amber-100 text-amber-700 border-amber-200",
    },
    new: { emoji: "✨", color: "bg-blue-100 text-blue-700 border-blue-200" },
    seafood: {
      emoji: "🦐",
      color: "bg-cyan-100 text-cyan-700 border-cyan-200",
    },
    meat: { emoji: "🥩", color: "bg-rose-100 text-rose-700 border-rose-200" },
  };
  const c = config[tag.toLowerCase()] || {
    emoji: "•",
    color: "bg-stone-100 text-stone-600 border-stone-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${c.color}`}
    >
      <span>{c.emoji}</span>
      <span>{tag}</span>
    </span>
  );
};

const PopularBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <span
    className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-amber-100 font-bold uppercase tracking-wider text-amber-700 ${
      compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
    }`}
  >
    <Star size={compact ? 9 : 11} fill="currentColor" strokeWidth={1.8} />
    <span>Popular</span>
  </span>
);

const MenuSkeleton: React.FC<{ darkMode: boolean }> = ({ darkMode }) => (
  <div
    className={`min-h-screen fixed inset-0 z-[120] flex items-center justify-center overflow-hidden ${
      darkMode ? "bg-stone-950" : "bg-stone-100"
    }`}
  >
    <div
      className={`absolute inset-0 ${
        darkMode
          ? "bg-[radial-gradient(circle_at_50%_30%,rgba(68,64,60,0.35),transparent_38%),linear-gradient(180deg,rgba(12,10,9,0.92),rgba(12,10,9,1))]"
          : "bg-[radial-gradient(circle_at_50%_30%,rgba(214,211,209,0.6),transparent_38%),linear-gradient(180deg,rgba(245,245,244,0.92),rgba(250,250,249,1))]"
      }`}
    />
    <div
      className={`relative h-16 w-16 rounded-full border ${
        darkMode ? "border-white/10 bg-white/5" : "border-stone-300/70 bg-white/70"
      } shadow-2xl backdrop-blur-xl`}
    >
      <div
        className={`absolute inset-3 animate-ping rounded-full ${
          darkMode ? "bg-white/20" : "bg-stone-500/20"
        }`}
      />
      <div
        className={`absolute inset-5 rounded-full ${
          darkMode ? "bg-white/35" : "bg-stone-700/45"
        }`}
      />
    </div>
  </div>
);

// ─── Product Card ────────────────────────────────────────────────────────────

interface ProductCardProps {
  product: Product;
  onSelect: (p: Product) => void;
  language: Language;
  isSubcategory?: boolean;
  darkMode: boolean;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  language,
  isSubcategory = false,
  darkMode,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const isAvailable = product.is_available !== 0;
  const isNew = product.is_new === 1;
  const tags = getTagList(product.tags);
  const allergens = getAllergenList(product.allergens);
  const name = getLangValue(product, "name", language);
  const desc = getLangValue(product, "description", language);
  const descMissingTranslation = isMissingTranslation(
    product,
    "description",
    language,
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={`group flex gap-4 items-start py-4 border-b last:border-0 transition-opacity
        ${darkMode ? "border-stone-700" : "border-stone-100"}
        ${!isAvailable ? "opacity-50" : ""}`}
    >
      {/* Image */}
      <div
        className={`relative shrink-0 ${isSubcategory ? "w-14 h-14" : "w-20 h-20 md:w-24 md:h-24"}`}
      >
        {product.image_url && !imageFailed ? (
          <button
            type="button"
            className="relative w-full h-full cursor-zoom-in text-left"
            onClick={() => isAvailable && onSelect(product)}
            disabled={!isAvailable}
            aria-label={`Open ${name}`}
          >
            <img
              src={product.image_url}
              alt={name}
              loading="lazy"
              decoding="async"
              onError={() => setImageFailed(true)}
              className={`w-full h-full object-cover rounded-2xl border shadow-sm transition-all
                ${darkMode ? "border-stone-700" : "border-stone-100"}
                ${!isAvailable ? "grayscale" : "group-hover:scale-105"}`}
            />
            {!isAvailable && (
              <div className="absolute inset-0 rounded-2xl bg-black/30 flex items-center justify-center">
                <span className="text-white text-[8px] font-bold uppercase tracking-wider text-center px-1">
                  {t("sold_out", language)}
                </span>
              </div>
            )}
            {isAvailable && (
              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                <Maximize2 size={16} className="text-white" />
              </div>
            )}
          </button>
        ) : (
          <div
            className={`w-full h-full rounded-2xl border flex items-center justify-center ${
              darkMode
                ? "bg-stone-800 border-stone-700 text-stone-600"
                : "bg-stone-100 border-stone-200 text-stone-300"
            }`}
            aria-hidden="true"
          >
            <Sparkles size={18} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Badges row */}
        {(isNew || !isAvailable) && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {isNew && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                <Sparkles size={9} /> {t("new_item", language)}
              </span>
            )}
            {!isAvailable && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-200 text-stone-500 border border-stone-300">
                <AlertCircle size={9} /> {t("sold_out", language)}
              </span>
            )}
          </div>
        )}

        {/* Name + Price */}
        <button
          type="button"
          disabled={!isAvailable}
          className={`w-full flex justify-between items-baseline gap-2 mb-1 text-left ${isAvailable ? "cursor-pointer" : "cursor-default"}`}
          onClick={() => isAvailable && onSelect(product)}
          aria-label={`Open ${name}`}
        >
          <h3
            className={`font-medium leading-tight truncate ${isSubcategory ? "text-sm" : "text-base md:text-lg"}
            ${darkMode ? "text-stone-100" : "text-stone-900"}`}
          >
            {name}
          </h3>
          <div
            className={`flex-shrink-0 flex items-baseline gap-1 font-mono ${darkMode ? "text-stone-300" : "text-stone-500"}`}
          >
            <span className={isSubcategory ? "text-sm" : "text-base"}>
              {product.price.toFixed(0)}
            </span>
            <span className="text-[10px]">{t("currency", language)}</span>
          </div>
        </button>

        {/* Description (reserve 3 lines to prevent layout shift on language switch) */}
        <p
          className={`text-sm leading-relaxed line-clamp-3 min-h-[4rem] ${darkMode ? "text-stone-400" : "text-stone-500"}`}
        >
          {desc || <span className="opacity-0">&nbsp;</span>}
          {descMissingTranslation && (
            <span
              className={`ml-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap inline-block ${darkMode ? "text-stone-500" : "text-stone-400"}`}
            >
              (
              {language === "EN"
                ? "Not translated yet"
                : language === "BG"
                  ? "Няма превод"
                  : "Нема превод"}
              )
            </span>
          )}
        </p>

        {/* Calories */}
        {product.calories && (
          <p
            className={`text-[10px] mt-1 font-mono ${darkMode ? "text-stone-500" : "text-stone-400"}`}
          >
            {product.calories} {t("calories_unit", language)}
          </p>
        )}

        {/* Dietary tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <DietaryBadge key={tag} tag={tag} />
            ))}
          </div>
        )}

        {/* Allergens */}
        {allergens.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span
              className={`text-[9px] uppercase tracking-widest font-bold mr-1 ${darkMode ? "text-stone-500" : "text-stone-400"}`}
            >
              {t("allergens", language)}:
            </span>
            {allergens.map((a) => (
              <AllergenBadge
                key={a}
                allergenKey={a}
                label={ALLERGEN_LABELS[a]?.[language] || a}
                size={26}
              />
            ))}
          </div>
        )}

        {/* Additions */}
        {product.additions && product.additions.length > 0 && (
          <div
            className={`mt-3 pt-3 border-t space-y-1 ${darkMode ? "border-stone-700" : "border-stone-100/70"}`}
          >
            <p
              className={`text-[9px] uppercase tracking-widest font-bold ${darkMode ? "text-stone-500" : "text-stone-400"}`}
            >
              {t("additions", language)}
            </p>
            {product.additions.map((add, i) => (
              <div
                key={i}
                className={`flex justify-between gap-3 text-xs min-w-0 ${darkMode ? "text-stone-400" : "text-stone-500"}`}
              >
                <span className="truncate">
                  + {getLangValue(add, "name", language)}
                </span>
                <span className="font-mono flex-shrink-0">
                  {add.price.toFixed(0)} {t("currency", language)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ─── Category Section ─────────────────────────────────────────────────────────

interface CategoryDisplayProps {
  category: Category;
  idx: number;
  onProductSelect: (product: Product) => void;
  onCategoryView: (category: Category) => void;
  isSubcategory?: boolean;
  language: Language;
  darkMode: boolean;
  searchQuery: string;
}

const CategoryDisplay: React.FC<CategoryDisplayProps> = ({
  category,
  idx,
  onProductSelect,
  onCategoryView,
  isSubcategory = false,
  language,
  darkMode,
  searchQuery,
}) => {
  const [isExpanded, setIsExpanded] = useState(isSubcategory);
  const [categoryImageFailed, setCategoryImageFailed] = useState(false);
  const name = getLangValue(category, "name", language);
  const isPopularCategory = category.is_popular === 1;
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  const categoryThumbSrc =
    !categoryImageFailed &&
    (category.image_url ||
      (!isSubcategory
        ? category.products.find((product) => product.image_url)?.image_url
        : ""));

  // Filter products by search query
  const filteredProducts = normalizedQuery
    ? category.products.filter((p) =>
        productMatchesSearch(p, normalizedQuery, language),
      )
    : category.products;

  const filteredSubcategories =
    category.subcategories?.filter((sub) => {
      if (!normalizedQuery) return true;
      return categoryMatchesSearch(sub, normalizedQuery, language);
    }) ?? [];
  const totalProducts =
    category.products.length +
    (category.subcategories || []).reduce(
      (total, sub) => total + (sub.products?.length || 0),
      0,
    );

  // Auto-expand when searching
  useEffect(() => {
    if (
      normalizedQuery &&
      (filteredProducts.length > 0 || filteredSubcategories.length > 0)
    ) {
      setIsExpanded(true);
    }
  }, [normalizedQuery, filteredProducts.length, filteredSubcategories.length]);

  const hasContent =
    filteredProducts.length > 0 || filteredSubcategories.length > 0;
  if (normalizedQuery && !hasContent) return null;

  return (
    <motion.section
      id={`cat-${category.id}`}
      initial={false}
      className={
        isSubcategory
          ? "ml-4 mt-4"
          : `border-b pb-2 last:border-0 ${darkMode ? "border-stone-700" : "border-stone-100"}`
      }
    >
      {/* Category header */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={`cat-body-${category.id}`}
        className={`w-full text-left flex items-center justify-between gap-3 cursor-pointer group
          ${
            isSubcategory
              ? `border-l-2 pl-4 py-2.5 ${darkMode ? "border-stone-600" : "border-stone-200"}`
              : "py-3"
          }`}
        onClick={() => {
          if (!isExpanded) onCategoryView(category);
          setIsExpanded(!isExpanded);
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {categoryThumbSrc ? (
            <span
              className={`relative flex-shrink-0 rounded-lg shadow-sm ${
                darkMode ? "ring-1 ring-white/15" : "ring-1 ring-stone-200"
              }`}
            >
              <img
                src={categoryThumbSrc}
                alt=""
                loading="lazy"
                decoding="async"
                onError={() => setCategoryImageFailed(true)}
                className={`${isSubcategory ? "w-7 h-7" : "w-12 h-12"} rounded-lg object-cover border border-white/60`}
              />
            </span>
          ) : !isSubcategory ? (
            <span
              className={`w-12 h-12 rounded-lg border border-white/60 flex-shrink-0 inline-flex items-center justify-center text-sm font-bold shadow-sm
                ${darkMode ? "bg-stone-800 text-stone-500 ring-1 ring-white/10" : "bg-stone-100 text-stone-400 ring-1 ring-stone-200"}`}
              aria-hidden="true"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
          ) : (
            <span
              className={`w-7 h-7 rounded-lg border flex-shrink-0 inline-flex items-center justify-center text-[10px] font-bold
                ${darkMode ? "bg-stone-800 border-stone-700 text-stone-500" : "bg-stone-100 border-stone-200 text-stone-400"}`}
              aria-hidden="true"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <h2
            className={`font-serif whitespace-nowrap transition-colors truncate
            ${isSubcategory ? "text-base md:text-lg" : "text-xl md:text-2xl"}
            ${darkMode ? "text-stone-100 group-hover:text-stone-300" : "text-stone-900 group-hover:text-stone-600"}`}
          >
            {name}
          </h2>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {isPopularCategory && <PopularBadge compact />}
          <span
            className={`transition-colors ${darkMode ? "text-stone-500 group-hover:text-stone-200" : "text-stone-300 group-hover:text-stone-900"}`}
          >
            {isExpanded ? (
              <ChevronDown size={isSubcategory ? 16 : 22} />
            ) : (
              <ChevronRight size={isSubcategory ? 16 : 22} />
            )}
          </span>
        </div>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id={`cat-body-${category.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-4 space-y-0">
              {/* Subcategories */}
              {filteredSubcategories.length > 0 && (
                <div className="mb-4 space-y-2">
                  {filteredSubcategories.map((sub, sIdx) => (
                    <CategoryDisplay
                      key={sub.id}
                      category={sub}
                      idx={sIdx}
                      onProductSelect={onProductSelect}
                      onCategoryView={onCategoryView}
                      isSubcategory={true}
                      language={language}
                      darkMode={darkMode}
                      searchQuery={searchQuery}
                    />
                  ))}
                </div>
              )}

              {/* Products */}
              <AnimatePresence initial={false}>
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={onProductSelect}
                    language={language}
                    isSubcategory={isSubcategory}
                    darkMode={darkMode}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

// ─── Sticky Category Nav ──────────────────────────────────────────────────────

interface CategoryNavProps {
  categories: Category[];
  language: Language;
  darkMode: boolean;
  activeId: number | null;
  onCategorySelect: (id: number) => void;
  onCategoryView: (category: Category) => void;
}

const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  language,
  darkMode,
  activeId,
  onCategorySelect,
  onCategoryView,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollTo = (category: Category) => {
    const id = category.id;
    onCategoryView(category);
    const el = document.getElementById(`cat-${id}`);
    if (el) {
      const offset = 104;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      onCategorySelect(id);
      window.scrollTo({ top, behavior: "smooth" });
    } else {
      onCategorySelect(id);
    }
    // Keep the active title centered in the horizontal nav.
    const pill = scrollRef.current?.querySelector(`[data-cat="${id}"]`);
    pill?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  if (categories.length < 2) return null;

  return (
    <div
      className={`sticky top-0 z-40 border-b backdrop-blur-xl
      ${darkMode ? "bg-stone-900/90 border-stone-700" : "bg-white/90 border-stone-100"}`}
    >
      <div className="relative">
        {/* Scrollable category titles */}
        <div
          ref={scrollRef}
          className="flex justify-start md:justify-center overflow-x-scroll overflow-y-hidden gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 md:py-2 scrollbar-none"
          style={
            {
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              // Keep layout stable when pills overflow in EN.
              scrollbarGutter: "stable",
            } as any
          }
        >
          {categories.map((cat) => {
            const isActive = activeId === cat.id;
            return (
              <button
                key={cat.id}
                data-cat={cat.id}
                type="button"
                onClick={() => scrollTo(cat)}
                aria-current={isActive ? "true" : undefined}
                title={getLangValue(cat, "name", language)}
                className={`min-h-8 md:min-h-11 flex-shrink-0 rounded-full px-3 md:px-4 py-1 md:py-2 border text-[10px] md:text-xs font-bold uppercase tracking-wide md:tracking-wider transition-colors whitespace-nowrap
                  ${
                    isActive
                      ? darkMode
                        ? "bg-stone-100 text-stone-900 border-stone-100 shadow-sm"
                        : "bg-stone-900 text-white border-stone-900 shadow-sm"
                      : darkMode
                        ? "text-stone-400 border-stone-800 hover:text-stone-100 hover:border-stone-600"
                        : "text-stone-500 border-stone-200 hover:text-stone-900 hover:border-stone-300"
                  }`}
              >
                {getLangValue(cat, "name", language)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Main MenuView ────────────────────────────────────────────────────────────

const heroContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 },
  },
};

const heroLogoVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 20 },
  },
};

export default function MenuView() {
  const { slug } = useParams<{ slug: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [language, setLanguage] = useState<Language>("MK");
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("menuDarkMode") !== "0";
    } catch {
      return true;
    }
  });
  const [showWifi, setShowWifi] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showTakeover, setShowTakeover] = useState(false);
  const [isTakeoverReady, setIsTakeoverReady] = useState(false);

  useEffect(() => {
    if (!restaurant || !restaurant.takeover_enabled) return;

    const shownKey = `takeover_${restaurant.id}`;
    if (sessionStorage.getItem(shownKey)) return;

    sessionStorage.setItem(shownKey, "1");
    setShowTakeover(true);

    const imageUrl = restaurant.takeover_image_url?.trim();
    if (!imageUrl) {
      setIsTakeoverReady(true);
      return;
    }

    setIsTakeoverReady(false);
    let cancelled = false;
    let didSettle = false;
    const reveal = () => {
      if (cancelled || didSettle) return;
      didSettle = true;
      setIsTakeoverReady(true);
    };
    const image = new Image();
    image.onload = reveal;
    image.onerror = reveal;
    image.src = imageUrl;
    const fallbackTimer = window.setTimeout(reveal, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimer);
      image.onload = null;
      image.onerror = null;
    };
  }, [restaurant]);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (darkMode) {
      document.documentElement.classList.remove("light-mode");
      if (meta) meta.setAttribute("content", "#1c1917");
    } else {
      document.documentElement.classList.add("light-mode");
      if (meta) meta.setAttribute("content", "#fcfbf7");
    }
  }, [darkMode]);

  const toggleDark = () => {
    setDarkMode((d) => {
      localStorage.setItem("menuDarkMode", d ? "0" : "1");
      return !d;
    });
  };

  const selectCategory = useCallback((id: number) => {
    setActiveCategoryId(id);
  }, []);

  const closeTakeover = useCallback(() => {
    setShowTakeover(false);
    setIsTakeoverReady(false);
  }, []);

  // Scroll detection
  useEffect(() => {
    const onScroll = () => {
      const atTop = window.scrollY <= 12;
      setShowBackToTop(window.scrollY > 350);
      setIsAtTop(atTop);
      if (!atTop) {
        setShowWifi(false);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`/api/public-menu/${slug}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to load menu (${res.status})`);
      const data = await res.json();
      setRestaurant(data.restaurant);
      setMenu(data.menu || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      setRestaurant(null);
      setMenu([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load this menu. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const availableLanguages = useMemo<Language[]>(() => {
    const languages: Language[] = ["MK"];
    if (hasMenuContentForLanguage(menu, "BG")) languages.push("BG");
    if (hasMenuContentForLanguage(menu, "EN")) languages.push("EN");
    return languages;
  }, [menu]);

  useEffect(() => {
    if (!availableLanguages.includes(language)) {
      setLanguage("MK");
    }
  }, [availableLanguages, language]);

  useEffect(() => {
    const checkAdminSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) return;
        const data = await res.json();
        setIsAdminAuthenticated(!!data.authenticated);
      } catch (error) {
        console.error("Error checking admin session:", error);
      }
    };

    checkAdminSession();
  }, []);

  // ── Loading state
  if (loading) return <MenuSkeleton darkMode={darkMode} />;

  if (loadError)
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-8 text-center ${darkMode ? "bg-stone-900 text-stone-100" : "bg-stone-50 text-stone-900"}`}
      >
        <AlertCircle size={36} className="mb-4 text-red-500" />
        <h1 className="text-3xl font-serif mb-3">Menu could not load</h1>
        <p className="max-w-sm text-stone-500 mb-6">{loadError}</p>
        <button
          type="button"
          onClick={fetchData}
          className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold uppercase tracking-widest text-stone-50 hover:bg-stone-800"
        >
          Try Again
        </button>
      </div>
    );

  // ── 404 state
  if (!restaurant)
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-8 text-center ${darkMode ? "bg-stone-900 text-stone-100" : "bg-stone-50 text-stone-900"}`}
      >
        <h1 className="text-4xl font-serif mb-4">404</h1>
        <p className="text-stone-500">This menu doesn't exist yet.</p>
      </div>
    );

  const hasWifi = !!restaurant.wifi_password;
  const hasPhone = !!restaurant.phone;
  const hasAddress = !!restaurant.address;
  const hasHours = !!restaurant.opening_hours;
  const hasSocial = !!(restaurant.facebook_url || restaurant.instagram_url);
  const hasInfo = hasWifi || hasPhone || hasAddress || hasHours;
  const logoSize = clampNumber(
    restaurant.logo_size,
    MIN_LOGO_SIZE,
    MAX_LOGO_SIZE,
    DEFAULT_LOGO_SIZE,
  );
  const logoScale = logoSize / 100;
  const logoFit = normalizeLogoFit(restaurant.logo_fit);
  const logoObjectPosition = `${clampNumber(
    restaurant.logo_position_x,
    0,
    100,
    DEFAULT_LOGO_POSITION,
  )}% ${clampNumber(
    restaurant.logo_position_y,
    0,
    100,
    DEFAULT_LOGO_POSITION,
  )}%`;
  const heroLogoStyle = {
    "--hero-logo-mobile-height": `clamp(${Math.round(
      94 * logoScale,
    )}px, ${(16 * logoScale).toFixed(1)}svh, ${Math.round(150 * logoScale)}px)`,
    "--hero-logo-tablet-height": `clamp(${Math.round(
      116 * logoScale,
    )}px, ${(13 * logoScale).toFixed(1)}svh, ${Math.round(180 * logoScale)}px)`,
    "--hero-logo-desktop-height": `clamp(${Math.round(
      120 * logoScale,
    )}px, ${(14 * logoScale).toFixed(1)}vh, ${Math.round(200 * logoScale)}px)`,
    width:
      logoFit === "cover"
        ? `min(${Math.round(360 * logoScale)}px, 82vw)`
        : "100%",
    maxWidth: "82vw",
    objectFit: logoFit,
    objectPosition: logoObjectPosition,
  } as React.CSSProperties;
  const footerLogoStyle: React.CSSProperties = {
    height: `${Math.round(112 * logoScale)}px`,
    width:
      logoFit === "cover"
        ? `min(${Math.round(260 * logoScale)}px, 70vw)`
        : "100%",
    maxWidth: "70vw",
    objectFit: logoFit,
    objectPosition: logoObjectPosition,
  };

  const bg = darkMode
    ? "bg-stone-900 text-stone-100"
    : "bg-[#fcfbf7] text-stone-900";
  const searchQuery = "";
  const setSearchQuery = (_value: string) => {};
  const searchInputRef = { current: null } as React.RefObject<HTMLInputElement>;
  const normalizedSearchQuery = "";
  const hasSearchResults = true;
  const trackCategoryView = (category: Category) => {
    if (!restaurant || restaurant.popular_badges_enabled === 0) return;
    fetch("/api/popularity/category-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        category_id: category.id,
      }),
      keepalive: true,
    }).catch((error) => {
      console.error("Error tracking category view:", error);
    });
  };

  return (
    <div
      className={`min-h-screen font-sans selection:bg-stone-200 relative transition-colors duration-300 ${bg}`}
    >
      <div className="relative z-10">
        {/* ── Top-left: Admin + Dark Mode + WiFi */}
        <div
          className={`fixed top-4 left-4 z-50 flex items-center gap-2 transition-all duration-300 ${
            isAtTop
              ? "translate-y-0 opacity-100"
              : "-translate-y-[150%] opacity-0 pointer-events-none md:translate-y-0 md:opacity-100 md:pointer-events-auto"
          }`}
        >
          {isAdminAuthenticated && (
            <Link
              to={`/${slug}/admin`}
              className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-full shadow-sm border backdrop-blur-md transition-all hover:scale-105
                ${
                  darkMode
                    ? "bg-stone-800/90 border-stone-700 text-stone-400 hover:text-stone-100"
                    : "bg-white/80 border-stone-200 text-stone-400 hover:text-stone-900"
                }`}
              title={t("back_to_admin", language)}
              aria-label={t("back_to_admin", language)}
            >
              <Settings size={18} />
            </Link>
          )}

          <button
            onClick={toggleDark}
            className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-full shadow-sm border backdrop-blur-md transition-all hover:scale-105
              ${
                darkMode
                  ? "bg-stone-800/90 border-stone-700 text-amber-400 hover:text-amber-300"
                  : "bg-white/80 border-stone-200 text-stone-400 hover:text-stone-900"
              }`}
            title="Toggle Dark Mode"
            aria-label="Toggle dark mode"
          >
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {hasWifi && (
            <button
              onClick={() => setShowWifi((v) => !v)}
              className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-full shadow-sm border backdrop-blur-md transition-all hover:scale-105
                ${
                  darkMode
                    ? "bg-stone-800/90 border-stone-700 text-stone-400 hover:text-stone-100"
                    : "bg-white/80 border-stone-200 text-stone-400 hover:text-stone-900"
                }`}
              title="WiFi Password"
              aria-label="Show WiFi password"
            >
              <Wifi size={18} />
            </button>
          )}
        </div>

        {/* ── Top-right: Reviews + Language */}
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 transition-all duration-300 ${
            isAtTop
              ? "translate-y-0 opacity-100"
              : "-translate-y-[150%] opacity-0 pointer-events-none md:translate-y-0 md:opacity-100 md:pointer-events-auto"
          }`}
        >
          {/* Reviews header button */}
          {restaurant.reviews_enabled !== 0 && (
            <a
              href={`/${slug}/reviews?view=list`}
              className={`min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-full shadow-sm border backdrop-blur-md transition-all hover:scale-105 text-[10px] font-bold uppercase tracking-wider ${
                darkMode
                  ? "bg-stone-800/90 border-stone-700 text-amber-400 hover:text-amber-300"
                  : "bg-white/80 border-stone-200 text-amber-600 hover:text-amber-700"
              }`}
              aria-label="View all reviews"
            >
              <Star size={14} fill="currentColor" />
              <span className="hidden sm:inline">{t("reviews", language)}</span>
            </a>
          )}

          {/* Language switcher */}
          {availableLanguages.length > 1 && (
            <div
              className={`rounded-full p-1 shadow-sm border backdrop-blur-md flex items-center gap-0.5
            ${darkMode ? "bg-stone-800/90 border-stone-700" : "bg-white/80 border-stone-200"}`}
            >
              {availableLanguages.map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  aria-label={`Switch language to ${l}`}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all
                  ${
                    language === l
                      ? darkMode
                        ? "bg-stone-100 text-stone-900"
                        : "bg-stone-900 text-white shadow-sm"
                      : darkMode
                        ? "text-stone-400 hover:text-stone-100"
                        : "text-stone-400 hover:text-stone-900"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Search Bar (expandable) */}
        {/* ── WiFi Popup */}
        <AnimatePresence>
          {showWifi && hasWifi && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className={`fixed top-16 left-4 z-50 rounded-2xl border shadow-xl p-5 w-64
                ${darkMode ? "bg-stone-800 border-stone-600" : "bg-white border-stone-200"}`}
            >
              <div className="flex items-center gap-2 mb-3">
                <Wifi size={16} className="text-blue-500" />
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${darkMode ? "text-stone-300" : "text-stone-700"}`}
                >
                  {t("wifi", language)}
                </span>
              </div>
              <p
                className={`font-mono text-base font-bold select-all cursor-text rounded-lg px-3 py-2
                ${darkMode ? "bg-stone-700 text-stone-100" : "bg-stone-100 text-stone-800"}`}
              >
                {restaurant.wifi_password}
              </p>
              {hasPhone && (
                <div
                  className={`mt-3 flex items-center gap-2 text-sm ${darkMode ? "text-stone-400" : "text-stone-500"}`}
                >
                  <Phone size={13} />
                  <a
                    href={`tel:${restaurant.phone}`}
                    className="hover:underline"
                  >
                    {restaurant.phone}
                  </a>
                </div>
              )}
              {hasAddress && (
                <div
                  className={`mt-1 flex items-center gap-2 text-sm ${darkMode ? "text-stone-400" : "text-stone-500"}`}
                >
                  <MapPin size={13} />
                  <span>{restaurant.address}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Hero */}
        <header
          className={`relative min-h-[360px] sm:min-h-[390px] md:min-h-[400px] lg:h-[38vh] lg:min-h-[380px] flex items-end justify-center overflow-hidden
          ${darkMode ? "bg-stone-900" : restaurant.background_url ? "bg-black" : ""}`}
        >
          {/* Full-bleed background layer */}
          <div
            className="absolute inset-0 z-0"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          >
            {restaurant.background_url ? (
              <img
                src={restaurant.background_url}
                alt={restaurant.name}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center center",
                  display: "block",
                }}
              />
            ) : restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={restaurant.name}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="w-full h-full object-cover opacity-20 grayscale"
              />
            ) : (
              <img
                src={`https://picsum.photos/seed/${restaurant.slug}/1200/600?blur=2`}
                alt="Background"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="w-full h-full object-cover opacity-15 grayscale"
                referrerPolicy="no-referrer"
              />
            )}
            <div
              className={`absolute inset-0 bg-gradient-to-b
              ${darkMode ? "from-stone-900/30 to-stone-900" : restaurant.background_url ? "from-black/20 to-black/60" : "from-transparent to-[#fcfbf7]"}`}
            />
          </div>

          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="show"
            className="relative z-10 w-full max-w-2xl text-center px-4 pt-[calc(env(safe-area-inset-top)+5rem)] pb-[30px] sm:px-6 sm:pt-[calc(env(safe-area-inset-top)+5.5rem)] sm:pb-[46px] md:pb-[30px] lg:pb-8"
          >
            {restaurant.logo_url ? (
              <motion.img
                variants={heroLogoVariants}
                src={restaurant.logo_url}
                alt={restaurant.name}
                loading="eager"
                decoding="async"
                className="mx-auto mb-3 h-[var(--hero-logo-mobile-height)] drop-shadow-2xl sm:mb-4 sm:h-[var(--hero-logo-tablet-height)] lg:mb-6 lg:h-[var(--hero-logo-desktop-height)]"
                style={heroLogoStyle}
              />
            ) : (
              <motion.p
                variants={heroItemVariants}
                className={`text-[10px] uppercase tracking-[0.35em] mb-3 font-medium
                ${darkMode || restaurant.background_url ? "text-stone-300" : "text-stone-500"}`}
              >
                {t("welcome", language)}
              </motion.p>
            )}
            <motion.h1
              variants={heroItemVariants}
              className={`text-4xl sm:text-5xl md:text-6xl font-serif mb-1 md:mb-2
              ${darkMode || restaurant.background_url ? "text-stone-100" : "text-stone-900"}`}
            >
              {restaurant.name}
            </motion.h1>
            {hasInfo && (
              <motion.div
                variants={heroItemVariants}
                className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-3 text-sm leading-snug sm:text-base md:text-[17px]
                ${darkMode || restaurant.background_url ? "text-stone-400" : "text-stone-400"}`}
              >
                {hasPhone && (
                  <a
                    href={`tel:${restaurant.phone}`}
                    className="flex items-center gap-1 hover:underline"
                  >
                    <Phone size={16} />
                    {restaurant.phone}
                  </a>
                )}
                {hasAddress && (
                  <span className="flex items-center gap-1">
                    <MapPin size={16} />
                    {restaurant.address}
                  </span>
                )}
                {hasWifi && (
                  <span className="flex items-center gap-1">
                    <Wifi size={16} />
                    {restaurant.wifi_password}
                  </span>
                )}
                {hasHours && (
                  <span className="flex items-center gap-1">
                    <Clock size={16} />
                    {restaurant.opening_hours}
                  </span>
                )}
              </motion.div>
            )}
            {hasSocial && (
              <motion.div
                variants={heroItemVariants}
                className="flex items-center justify-center gap-4 mt-3 md:mt-4"
              >
                {restaurant.facebook_url && (
                  <a
                    href={restaurant.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`transition-all hover:scale-110 ${darkMode || restaurant.background_url ? "text-stone-300 hover:text-white" : "text-stone-500 hover:text-[#1877F2]"}`}
                    title="Facebook"
                    aria-label="Open Facebook page"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="currentColor"
                    >
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>
                )}
                {restaurant.instagram_url && (
                  <a
                    href={restaurant.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`transition-all hover:scale-110 ${darkMode || restaurant.background_url ? "text-stone-300 hover:text-white" : "text-stone-500 hover:text-[#E1306C]"}`}
                    title="Instagram"
                    aria-label="Open Instagram page"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="currentColor"
                    >
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                )}
              </motion.div>
            )}
            <motion.div
              variants={heroItemVariants}
              className={`w-10 h-px mx-auto mt-4 md:mt-6 ${darkMode || restaurant.background_url ? "bg-stone-500" : "bg-stone-300"}`}
            />
          </motion.div>
        </header>

        {/* ── Sticky Category Nav */}
        <CategoryNav
          categories={menu}
          language={language}
          darkMode={darkMode}
          activeId={activeCategoryId}
          onCategorySelect={selectCategory}
          onCategoryView={trackCategoryView}
        />

        {/* ── Main Content */}
        <main className="max-w-2xl mx-auto px-4 md:px-6 pb-28 pt-4">
          {menu.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">Menu</p>
              <p className={darkMode ? "text-stone-500" : "text-stone-400"}>
                {t("updated", language)}
              </p>
              <p
                className={`mt-2 text-sm ${darkMode ? "text-stone-600" : "text-stone-400"}`}
              >
                Please check again soon.
              </p>
            </div>
          ) : normalizedSearchQuery && !hasSearchResults ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <p className={`text-4xl mb-4`}>🔍</p>
              <p className={darkMode ? "text-stone-400" : "text-stone-500"}>
                {t("no_results", language)} "
                <span className="font-medium">{searchQuery}</span>"
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                className={`mt-5 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-widest ${
                  darkMode
                    ? "bg-stone-800 text-stone-200 hover:bg-stone-700"
                    : "bg-stone-900 text-stone-50 hover:bg-stone-800"
                }`}
              >
                Clear Search
              </button>
            </motion.div>
          ) : (
            <div className="space-y-1">
              {menu.map((category, idx) => (
                <CategoryDisplay
                  key={category.id}
                  category={category}
                  idx={idx}
                  onProductSelect={setSelectedProduct}
                  onCategoryView={trackCategoryView}
                  language={language}
                  darkMode={darkMode}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          )}
        </main>

        {/* ── Footer */}
        <footer
          className={`border-t mt-6 ${darkMode ? "border-stone-800 bg-stone-900" : "border-stone-100 bg-[#f5f4ef]"}`}
        >
          {/* Restaurant info block */}
          <div className="max-w-2xl mx-auto px-6 pt-10 pb-8 flex flex-col items-center gap-6">
            {/* Logo or Name */}
            {restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={restaurant.name}
                loading="lazy"
                decoding="async"
                style={footerLogoStyle}
              />
            ) : (
              <h2
                className={`text-2xl font-serif ${darkMode ? "text-stone-300" : "text-stone-700"}`}
              >
                {restaurant.name}
              </h2>
            )}

            {/* Divider */}
            <div
              className={`w-12 h-px ${darkMode ? "bg-stone-700" : "bg-stone-300"}`}
            />

            {/* Info row: phone + address */}
            {(restaurant.phone ||
              restaurant.address ||
              restaurant.wifi_password) && (
              <div
                className={`flex flex-wrap justify-center gap-x-6 gap-y-2 ${darkMode ? "text-stone-400" : "text-stone-500"}`}
                style={{ fontSize: "19px" }}
              >
                {restaurant.phone && (
                  <a
                    href={`tel:${restaurant.phone}`}
                    className="flex items-center gap-1.5 hover:underline transition-colors"
                  >
                    <Phone size={18} />
                    {restaurant.phone}
                  </a>
                )}
                {restaurant.address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={18} />
                    {restaurant.address}
                  </span>
                )}
                {restaurant.wifi_password && (
                  <span className="flex items-center gap-1.5">
                    <Wifi size={18} />
                    {restaurant.wifi_password}
                  </span>
                )}
                {restaurant.opening_hours && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={18} />
                    {restaurant.opening_hours}
                  </span>
                )}
              </div>
            )}

            {/* Social icons */}
            {(restaurant.facebook_url || restaurant.instagram_url) && (
              <div className="flex items-center gap-4">
                {restaurant.facebook_url && (
                  <a
                    href={restaurant.facebook_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`transition-all hover:scale-110 ${darkMode ? "text-stone-400 hover:text-blue-400" : "text-stone-400 hover:text-[#1877F2]"}`}
                    title="Facebook"
                    aria-label="Open Facebook page"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="26"
                      height="26"
                      fill="currentColor"
                    >
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                    </svg>
                  </a>
                )}
                {restaurant.instagram_url && (
                  <a
                    href={restaurant.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`transition-all hover:scale-110 ${darkMode ? "text-stone-400 hover:text-pink-400" : "text-stone-400 hover:text-[#E1306C]"}`}
                    title="Instagram"
                    aria-label="Open Instagram page"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="26"
                      height="26"
                      fill="currentColor"
                    >
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                  </a>
                )}
              </div>
            )}

            {/* Divider */}
            <div
              className={`w-full h-px ${darkMode ? "bg-stone-800" : "bg-stone-200"}`}
            />

            {/* Powered by line */}
            <p
              className={`text-[10px] uppercase tracking-widest pb-2 ${darkMode ? "text-stone-700" : "text-stone-400"}`}
            >
              {t("powered", language)}{" "}
              {restaurant.footer_link ? (
                <a href={restaurant.footer_link} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {restaurant.footer_text || "MenuQR"}
                </a>
              ) : (
                restaurant.footer_text || "MenuQR"
              )}
              {" "}&bull; {new Date().getFullYear()}
            </p>
          </div>
        </footer>

        {/* ── Back to Top Button */}
        <AnimatePresence>
          {showBackToTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className={`fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 h-9 w-9 md:h-11 md:w-11 inline-flex items-center justify-center rounded-full shadow-lg border transition-colors
                ${darkMode ? "bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700" : "bg-white border-stone-200 text-stone-600 hover:bg-stone-100"}`}
              title="Back to top"
              aria-label="Back to top"
            >
              <ChevronUp size={16} className="md:hidden" />
              <ChevronUp size={20} className="hidden md:block" />
            </motion.button>
          )}
        </AnimatePresence>

        <ImageModal
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
          language={language}
          darkMode={darkMode}
        />

        <AnimatePresence>
          {showTakeover && restaurant && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-[28px]"
              onClick={closeTakeover}
            >
              <AnimatePresence mode="wait">
                {!isTakeoverReady ? (
                  <motion.div
                    key="takeover-preparing"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    className="h-12 w-12 rounded-full border border-white/20 bg-white/10 shadow-2xl backdrop-blur-md"
                  >
                    <div className="h-full w-full animate-pulse rounded-full bg-white/20" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="takeover-card"
                    initial={{ scale: 0.96, opacity: 0, y: 8 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0, y: 8 }}
                    transition={{ type: "spring", damping: 32, stiffness: 520 }}
                    className={`relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl ${darkMode ? "bg-stone-900 text-stone-100" : "bg-white text-stone-900"}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="absolute top-4 right-4 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70 transition-colors"
                      onClick={closeTakeover}
                    >
                      <X size={20} />
                    </button>

                    {restaurant.takeover_image_url && (
                      <div className="w-full aspect-[4/3] sm:aspect-video relative overflow-hidden">
                        <img
                          src={restaurant.takeover_image_url}
                          alt={restaurant.takeover_title || "Promo"}
                          className="w-full h-full object-cover"
                          decoding="async"
                          fetchPriority="high"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                      </div>
                    )}

                    <div
                      className={`p-6 ${restaurant.takeover_image_url ? "-mt-8 relative z-10" : ""}`}
                    >
                      <div className="flex flex-col items-center text-center gap-3">
                        {restaurant.takeover_title && (
                          <h2 className="text-2xl font-black uppercase tracking-wide">
                            {restaurant.takeover_title}
                          </h2>
                        )}

                        {restaurant.takeover_message && (
                          <p
                            className={`text-sm md:text-base ${darkMode ? "text-stone-300" : "text-stone-600"}`}
                          >
                            {restaurant.takeover_message}
                          </p>
                        )}

                        {restaurant.takeover_price && (
                          <div className="mt-2 inline-block px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full font-bold shadow-md">
                            {restaurant.takeover_price}
                          </div>
                        )}

                        {restaurant.takeover_allergens && (
                          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-stone-500" : "text-stone-400"}`}
                            >
                              {t("allergens", language)}:
                            </span>
                            {getAllergenList(restaurant.takeover_allergens).map(
                              (a) => (
                                <AllergenBadge
                                  key={a}
                                  allergenKey={a}
                                  darkMode={darkMode}
                                  language={language}
                                />
                              ),
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
