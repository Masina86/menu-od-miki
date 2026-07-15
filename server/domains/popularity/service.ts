import Database from "better-sqlite3";
import {
  getCurrentPeriodKey,
  getPreviousPeriodKey,
} from "./periods.js";

export function createPopularityService(
  db: Database.Database,
  config: { timeZone: string; cutoffHour: number },
) {
  const POPULARITY_TIME_ZONE = config.timeZone;
  const POPULARITY_CUTOFF_HOUR = config.cutoffHour;
const getCategoryById = (categoryId: number, restaurantId: number) =>
  db
    .prepare(
      "SELECT id, name, name_en, name_bg FROM categories WHERE id = ? AND restaurant_id = ?",
    )
    .get(categoryId, restaurantId) as any;

const getPopularCategoryWinner = (restaurantId: number, periodKey: string) =>
  db
    .prepare(
      `SELECT
         c.id,
         c.name,
         c.name_en,
         c.name_bg,
         COUNT(e.id) AS views
       FROM category_view_events e
       JOIN categories c ON c.id = e.category_id
       WHERE e.restaurant_id = ?
         AND e.period_key = ?
       GROUP BY c.id
       ORDER BY views DESC, c.sort_order ASC, c.id ASC
       LIMIT 1`,
    )
    .get(restaurantId, periodKey) as any;

const refreshPopularCategory = (restaurant: any) => {
  const restaurantId = Number(restaurant.id);
  const currentPeriodKey = getCurrentPeriodKey(new Date(), { timeZone: POPULARITY_TIME_ZONE, cutoffHour: POPULARITY_CUTOFF_HOUR });
  const targetPopularPeriodKey = getPreviousPeriodKey(currentPeriodKey, POPULARITY_TIME_ZONE);

  if (restaurant.popular_category_period_key === targetPopularPeriodKey) {
    return restaurant;
  }

  const winner = getPopularCategoryWinner(
    restaurantId,
    targetPopularPeriodKey,
  );
  db.prepare(
    `UPDATE restaurants
     SET popular_category_id = ?,
         popular_category_period_key = ?,
         popular_category_updated_at = ?
     WHERE id = ?`,
  ).run(
    winner?.id || null,
    targetPopularPeriodKey,
    new Date().toISOString(),
    restaurantId,
  );

  return {
    ...restaurant,
    popular_category_id: winner?.id || null,
    popular_category_period_key: targetPopularPeriodKey,
    popular_category_updated_at: new Date().toISOString(),
  };
};

const getPopularCategoryStats = (restaurantId: number) => {
  const restaurant = refreshPopularCategory(
    db
      .prepare("SELECT * FROM restaurants WHERE id = ?")
      .get(restaurantId) as any,
  );
  const currentPeriodKey = getCurrentPeriodKey(new Date(), { timeZone: POPULARITY_TIME_ZONE, cutoffHour: POPULARITY_CUTOFF_HOUR });
  const previousPeriodKey = getPreviousPeriodKey(currentPeriodKey, POPULARITY_TIME_ZONE);
  const activeCategory = restaurant.popular_category_id
    ? getCategoryById(Number(restaurant.popular_category_id), restaurantId)
    : null;
  const currentLeader = getPopularCategoryWinner(
    restaurantId,
    currentPeriodKey,
  );
  const previousWinner = getPopularCategoryWinner(
    restaurantId,
    previousPeriodKey,
  );
  const currentViews = db
    .prepare(
      `SELECT COUNT(*) AS views
       FROM category_view_events
       WHERE restaurant_id = ? AND period_key = ?`,
    )
    .get(restaurantId, currentPeriodKey) as any;

  return {
    enabled: restaurant.popular_badges_enabled !== 0,
    current_period_key: currentPeriodKey,
    popular_period_key: previousPeriodKey,
    cutoff_hour: POPULARITY_CUTOFF_HOUR,
    time_zone: POPULARITY_TIME_ZONE,
    active_category: activeCategory,
    current_leader: currentLeader || null,
    previous_winner: previousWinner || null,
    current_period_views: Number(currentViews?.views || 0),
  };
};

const applyPopularCategory = (menu: any[], restaurant: any) => {
  if (restaurant.popular_badges_enabled === 0) return menu;
  const popularCategoryId = Number(restaurant.popular_category_id || 0);
  const markCategory = (category: any): any => ({
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