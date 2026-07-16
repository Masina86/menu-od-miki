import Database from "better-sqlite3";
import type { Category, Product } from "../../../shared/types.js";
import { compactImageUrl } from "../images/dataUrl.js";
import { buildMenuTree } from "./tree.js";

export function buildMenu(
  db: Database.Database,
  restaurantId: string | number,
  _compactImages = true,
): Category[] {
  const allCategories = db
    .prepare(
      "SELECT id, restaurant_id, parent_id, name, name_en, name_bg, image_url, sort_order FROM categories WHERE restaurant_id = ? ORDER BY sort_order, id",
    )
    .all(restaurantId) as Array<Record<string, unknown>>;
  const categoryIds = allCategories.map((category) => category.id);
  const products = categoryIds.length
    ? (db
        .prepare(
          "SELECT id, category_id, name, name_en, name_bg, price, description, description_en, description_bg, image_url, sort_order, is_available, tags, allergens, calories, is_featured, is_new FROM products WHERE category_id IN (" +
            categoryIds.map(() => "?").join(",") +
            ") ORDER BY category_id, sort_order, id",
        )
        .all(...categoryIds) as Array<Record<string, unknown>>)
    : [];
  const productIds = products.map((product) => product.id);
  const additions = productIds.length
    ? (db
        .prepare(
          "SELECT id, product_id, name, name_en, name_bg, price FROM additions WHERE product_id IN (" +
            productIds.map(() => "?").join(",") +
            ") ORDER BY product_id, id",
        )
        .all(...productIds) as Array<Record<string, unknown>>)
    : [];
  const additionsByProduct = new Map<number, Array<Record<string, unknown>>>();
  for (const addition of additions) {
    const productId = Number(addition.product_id);
    const list = additionsByProduct.get(productId) || [];
    list.push(addition);
    additionsByProduct.set(productId, list);
  }

  const enrichedProducts = products.map((product) => ({
    ...product,
    image_url: compactImageUrl(
      "products",
      Number(product.id),
      typeof product.image_url === "string" ? product.image_url : null,
    ),
    additions: additionsByProduct.get(Number(product.id)) || [],
  }));
  const enrichedCategories = allCategories.map((category) => ({
    ...category,
    image_url: compactImageUrl(
      "categories",
      Number(category.id),
      typeof category.image_url === "string" ? category.image_url : null,
    ),
    products: [],
    subcategories: [],
  }));

  return buildMenuTree(
    enrichedCategories as unknown as Category[],
    enrichedProducts as unknown as Product[],
  );
}
