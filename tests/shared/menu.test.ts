import { describe, expect, it } from "vitest";
import {
  categoryMatchesSearch,
  getAllergens,
  getLanguageValue,
  isMissingTranslation,
  normalizeSearchQuery,
  productMatchesSearch,
} from "../../src/lib/menu";
import type { Category, Product } from "../../shared/types";

const product: Product = {
  id: 1,
  category_id: 2,
  name: "Шопска салата",
  name_en: "Shopska Salad",
  description: "Свежа салата",
  price: 5,
};

const category: Category = {
  id: 2,
  restaurant_id: 1,
  name: "Салати",
  products: [product],
  subcategories: [],
};

describe("shared menu helpers", () => {
  it("uses the selected translation and falls back to the base value", () => {
    expect(getLanguageValue(product, "name", "EN")).toBe("Shopska Salad");
    expect(getLanguageValue(product, "name", "BG")).toBe("Шопска салата");
    expect(isMissingTranslation(product, "name", "BG")).toBe(true);
  });

  it("normalizes search and matches nested menu content", () => {
    expect(normalizeSearchQuery("  SHOPSKA ")).toBe("shopska");
    expect(productMatchesSearch(product, "shopska", "EN")).toBe(true);
    expect(categoryMatchesSearch(category, "салата", "MK")).toBe(true);
  });

  it("parses allergen lists without empty values", () => {
    expect(getAllergens("gluten, dairy, ,nuts")).toEqual([
      "gluten",
      "dairy",
      "nuts",
    ]);
  });
});
