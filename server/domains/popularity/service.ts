import Database from "better-sqlite3";
import type { Category } from "../../../shared/types.js";
import {
  getCurrentPeriodKey,
  getPreviousPeriodKey,
} from "./periods.js";

interface CategorySummary {
  id: number;
  name: string;
  name_en?: string | null;
  name_bg?: string | null;
}

interface PopularCategoryWinner extends CategorySummary {
  views: number | bigint;
}

interface PopularityRestaurantRow {
  id: number;
  popular_category_id: number | null;
  popular_category_period_key: string | null;
  popular_category_updated_at: string | null;
  popular_badges_enabled: number;
}

interface ViewCountRow {
  views: number | bigint;
}

export function createPopularityService(
  db: Database.Database,
  config: { timeZone: string; cutoffHour: number },
) {
  const getCategoryById = (
    categoryId: number,
    restaurantId: number,
  ): CategorySummary | undefined =>
    db
      .prepare(
        "SELECT id, name, name_en, name_bg FROM categories WHERE id = ? AND restaurant_id = ?",
      )
      .get(categoryId, restaurantId) as CategorySummary | undefined;

  const getPopularCategoryWinner = (
    restaurantId: number,
    periodKey: string,
  ): PopularCategoryWinner | undefined =>
    db
      .prepare(
        "SELECT c.id, c.name, c.name_en, c.name_bg, COUNT(e.id) AS views " +
          "FROM category_view_events e " +
          "JOIN categories c ON c.id = e.category_id " +
          "WHERE e.restaurant_id = ? AND e.period_key = ? " +
          "GROUP BY c.id " +
          "ORDER BY views DESC, c.sort_order ASC, c.id ASC LIMIT 1",
      )
      .get(restaurantId, periodKey) as PopularCategoryWinner | undefined;

  const refreshPopularCategory = (
    restaurant: PopularityRestaurantRow,
  ): PopularityRestaurantRow => {
    const currentPeriodKey = getCurrentPeriodKey(new Date(), {
      timeZone: config.timeZone,
      cutoffHour: config.cutoffHour,
    });
    const targetPopularPeriodKey = getPreviousPeriodKey(
      currentPeriodKey,
      config.timeZone,
    );

    if (restaurant.popular_category_period_key === targetPopularPeriodKey) {
      return restaurant;
    }

    const winner = getPopularCategoryWinner(
      restaurant.id,
      targetPopularPeriodKey,
    );
    const updatedAt = new Date().toISOString();
    db.prepare(
      "UPDATE restaurants SET popular_category_id = ?, " +
        "popular_category_period_key = ?, popular_category_updated_at = ? " +
        "WHERE id = ?",
    ).run(
      winner?.id ?? null,
      targetPopularPeriodKey,
      updatedAt,
      restaurant.id,
    );

    return {
      ...restaurant,
      popular_category_id: winner?.id ?? null,
      popular_category_period_key: targetPopularPeriodKey,
      popular_category_updated_at: updatedAt,
    };
  };

  const getPopularCategoryStats = (restaurantId: number) => {
    const storedRestaurant = db
      .prepare("SELECT * FROM restaurants WHERE id = ?")
      .get(restaurantId) as PopularityRestaurantRow | undefined;
    if (!storedRestaurant) return null;

    const restaurant = refreshPopularCategory(storedRestaurant);
    const currentPeriodKey = getCurrentPeriodKey(new Date(), {
      timeZone: config.timeZone,
      cutoffHour: config.cutoffHour,
    });
    const previousPeriodKey = getPreviousPeriodKey(
      currentPeriodKey,
      config.timeZone,
    );
    const activeCategory = restaurant.popular_category_id
      ? getCategoryById(restaurant.popular_category_id, restaurantId)
      : null;
    const currentLeader =
      getPopularCategoryWinner(restaurantId, currentPeriodKey) ?? null;
    const previousWinner =
      getPopularCategoryWinner(restaurantId, previousPeriodKey) ?? null;
    const currentViews = db
      .prepare(
        "SELECT COUNT(*) AS views FROM category_view_events " +
          "WHERE restaurant_id = ? AND period_key = ?",
      )
      .get(restaurantId, currentPeriodKey) as ViewCountRow | undefined;

    return {
      enabled: restaurant.popular_badges_enabled !== 0,
      current_period_key: currentPeriodKey,
      popular_period_key: previousPeriodKey,
      cutoff_hour: config.cutoffHour,
      time_zone: config.timeZone,
      active_category: activeCategory,
      current_leader: currentLeader,
      previous_winner: previousWinner,
      current_period_views: Number(currentViews?.views || 0),
    };
  };

  const applyPopularCategory = (
    menu: Category[],
    restaurant: Pick<
      PopularityRestaurantRow,
      "popular_badges_enabled" | "popular_category_id"
    >,
  ): Category[] => {
    if (restaurant.popular_badges_enabled === 0) return menu;
    const popularCategoryId = Number(restaurant.popular_category_id || 0);
    const markCategory = (category: Category): Category => ({
      ...category,
      is_popular: category.id === popularCategoryId ? 1 : 0,
      subcategories: (category.subcategories || []).map(markCategory),
    });
    return menu.map(markCategory);
  };

  return {
    getCategoryById,
    getPopularCategoryWinner,
    refreshPopularCategory,
    getPopularCategoryStats,
    applyPopularCategory,
  };
}
