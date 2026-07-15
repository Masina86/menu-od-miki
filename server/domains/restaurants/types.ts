import type { Restaurant } from "../../../shared/types.js";

export type RestaurantDbRow = Restaurant & {
  popular_category_id: number | null;
  popular_category_period_key: string | null;
  popular_category_updated_at: string | null;
  popular_badges_enabled: number;
  search_enabled: number;
};
