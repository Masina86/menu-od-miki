import type { AllergenKey, Category, Language, Product } from "../../shared/types";

type Translatable = object;
const FALLBACK_TRANSLATIONS: Record<string, Record<Language, string>> = {
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


function valuesOf(object: Translatable): Record<string, unknown> {
  return object as Record<string, unknown>;
}

export function getLanguageValue(
  object: Translatable,
  field: string,
  language: Language,
): string {
  const values = valuesOf(object);
  const translatedField =
    language === "EN" ? field + "_en" : language === "BG" ? field + "_bg" : field;
  const translated = values[translatedField];
  if (translated != null && String(translated).trim()) return String(translated);

  const base = String(values[field] ?? "");
  const fallback = FALLBACK_TRANSLATIONS[base.toLowerCase().trim()]?.[language];
  return fallback || base;
}

export function isMissingTranslation(
  object: Translatable,
  field: string,
  language: Language,
): boolean {
  if (language === "MK") return false;
  const values = valuesOf(object);
  const translatedField = language === "EN" ? field + "_en" : field + "_bg";
  return Boolean(
    String(values[field] ?? "").trim() &&
      !String(values[translatedField] ?? "").trim(),
  );
}

export function parseCommaList(value?: string): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllergens(value?: string): AllergenKey[] {
  return parseCommaList(value) as AllergenKey[];
}

export function normalizeSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function productMatchesSearch(
  product: Product,
  query: string,
  language: Language,
): boolean {
  const normalized = normalizeSearchQuery(query);
  return [
    getLanguageValue(product, "name", language),
    getLanguageValue(product, "description", language),
    ...parseCommaList(product.tags),
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}

export function categoryMatchesSearch(
  category: Category,
  query: string,
  language: Language,
): boolean {
  const normalized = normalizeSearchQuery(query);
  return (
    getLanguageValue(category, "name", language)
      .toLocaleLowerCase()
      .includes(normalized) ||
    category.products.some((product) =>
      productMatchesSearch(product, normalized, language),
    ) ||
    (category.subcategories || []).some((child) =>
      categoryMatchesSearch(child, normalized, language),
    )
  );
}

export const getLangValue = getLanguageValue;
export const getAllergenList = getAllergens;
export const getTagList = parseCommaList;