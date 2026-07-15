import type { Category, Product } from "../../../shared/types.js";

export function buildMenuTree(
  categories: Category[],
  products: Product[],
): Category[] {
  const byCategory = new Map<number, Product[]>();
  for (const product of products) {
    const current = byCategory.get(product.category_id) || [];
    current.push(product);
    byCategory.set(product.category_id, current);
  }

  const byId = new Map<number, Category>();
  for (const category of categories) {
    byId.set(category.id, {
      ...category,
      products: [...(byCategory.get(category.id) || [])].sort(sortByOrder),
      subcategories: [],
    });
  }

  const roots: Category[] = [];
  for (const category of categories) {
    const current = byId.get(category.id);
    if (!current) continue;
    if (category.parent_id != null && byId.has(category.parent_id)) {
      byId.get(category.parent_id)!.subcategories!.push(current);
    } else {
      roots.push(current);
    }
  }

  const sortTree = (items: Category[]) => {
    items.sort(sortByOrder);
    for (const item of items) sortTree(item.subcategories || []);
  };
  sortTree(roots);
  return roots;
}

function sortByOrder<T extends { sort_order?: number; id: number }>(a: T, b: T) {
  return (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id;
}
