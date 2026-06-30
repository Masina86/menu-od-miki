import type { AllergenKey, Category, Language, Product } from "../types";

type Translatable = object;

export const getLangValue = (
  obj: Translatable,
  field: string,
  lang: Language,
): string => {
  const values = obj as Record<string, unknown>;
  const dbValue =
    lang === "EN"
      ? values[`${field}_en`]
      : lang === "BG"
        ? values[`${field}_bg`]
        : values[field];
  if (dbValue && String(dbValue).trim() !== "") return String(dbValue);

  const original = values[field];
  return original ? String(original) : "";
};

export const isMissingTranslation = (
  obj: Translatable,
  field: string,
  lang: Language,
) => {
  if (lang === "MK") return false;
  const values = obj as Record<string, unknown>;
  const translated =
    lang === "EN"
      ? values[`${field}_en`]
      : lang === "BG"
        ? values[`${field}_bg`]
        : "";
  const translatedOk = translated && String(translated).trim() !== "";
  const baseOk = values[field] && String(values[field]).trim() !== "";
  return Boolean(baseOk && !translatedOk);
};

export const getAllergenList = (allergens?: string): AllergenKey[] => {
  if (!allergens) return [];
  return allergens
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean) as AllergenKey[];
};

export const getTagList = (tags?: string): string[] => {
  if (!tags) return [];
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

export const normalizeSearchQuery = (query: string) =>
  query.trim().toLowerCase();

export const productMatchesSearch = (
  product: Product,
  query: string,
  language: Language,
) =>
  getLangValue(product, "name", language).toLowerCase().includes(query) ||
  getLangValue(product, "description", language).toLowerCase().includes(query) ||
  getTagList(product.tags).some((tag) => tag.toLowerCase().includes(query));

export const categoryMatchesSearch = (
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
