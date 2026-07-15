export type Language = "MK" | "BG" | "EN";

export type LogoFit = "contain" | "cover";

export type DbFlag = 0 | 1;

export type AllergenKey =
  | "gluten"
  | "nuts"
  | "dairy"
  | "eggs"
  | "fish"
  | "soy"
  | "sesame"
  | "celery";

export interface Addition {
  id: number;
  product_id: number;
  name: string;
  name_en?: string;
  name_bg?: string;
  price: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  name_en?: string;
  name_bg?: string;
  price: number;
  description: string;
  description_en?: string;
  description_bg?: string;
  image_url?: string;
  additions?: Addition[];
  sort_order?: number;
  is_available?: number;
  tags?: string;
  allergens?: string;
  calories?: number;
  is_featured?: number;
  is_new?: number;
}

export interface Category {
  id: number;
  restaurant_id: number;
  name: string;
  name_en?: string;
  name_bg?: string;
  image_url?: string;
  products: Product[];
  subcategories?: Category[];
  parent_id?: number | null;
  sort_order?: number;
  is_popular?: number;
}

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  background_url?: string | null;
  logo_url?: string | null;
  logo_size?: number;
  logo_fit?: LogoFit;
  logo_position_x?: number;
  logo_position_y?: number;
  phone?: string | null;
  address?: string | null;
  wifi_password?: string | null;
  opening_hours?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  popular_badges_enabled?: number;
  reviews_enabled?: number;
  search_enabled?: number;
  takeover_enabled?: number;
  takeover_title?: string | null;
  takeover_message?: string | null;
  takeover_price?: string | null;
  takeover_allergens?: string | null;
  takeover_image_url?: string | null;
  current_month_scans?: number;
  footer_text?: string | null;
  footer_link?: string | null;
}

export interface Review {
  id: number;
  restaurant_id: number;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

export interface AuthSessionResponse {
  authenticated: boolean;
}

export type ScanStatisticsStatus = "unavailable" | "partial" | "complete";

export type ScanStatisticsExportScope = "all" | "month" | "day";

export type ScanSource = "qr" | "direct" | "unattributed";

export interface ScanSourceTotals {
  total: number;
  qr: number;
  direct: number;
  unattributed: number;
}

export interface ScanDayStatistics {
  day_key: string;
  scan_count: number;
  source_totals: ScanSourceTotals;
}

export interface ScanMonthSummary {
  month_key: string;
  scan_count: number;
  daily_status: ScanStatisticsStatus;
  source_totals: ScanSourceTotals;
}

export interface ScanMonthStatistics extends ScanMonthSummary {
  daily_tracking_started_on: string;
  daily_scan_count: number;
  tracked_days: number;
  active_days: number;
  average_daily_scans: number;
  days: ScanDayStatistics[];
}

export interface ScanPeriodStatistics {
  scan_count: number;
  source_totals: ScanSourceTotals;
}

export interface ScanWeekStatistics extends ScanPeriodStatistics {
  start_day_key: string;
  end_day_key: string;
}

export interface ScanMonthPeriodStatistics extends ScanPeriodStatistics {
  month_key: string;
}

export interface ScanStatisticsOverview {
  today: ScanPeriodStatistics;
  this_week: ScanWeekStatistics;
  current_month: ScanMonthPeriodStatistics;
  previous_month: ScanMonthPeriodStatistics;
  month_change_percent: number | null;
  busiest_day: ScanDayStatistics | null;
}

export interface ScanStatisticsResponse {
  restaurant_id: number;
  time_zone: string;
  all_time_scans: number;
  all_time_source_totals: ScanSourceTotals;
  daily_tracking_started_on: string;
  overview: ScanStatisticsOverview;
  months: ScanMonthSummary[];
  selected_month: ScanMonthStatistics | null;
  selected_day: ScanDayStatistics | null;
}

export interface PublicMenuResponse {
  restaurant: Restaurant;
  menu: Category[];
}

export interface ReviewListResponse {
  reviews: Review[];
  reviews_enabled: boolean;
}

export interface ReviewResponse {
  review: Review;
}

export interface ImagePreviewResponse {
  image_url: string;
}

export interface CategoryDraft {
  name: string;
  name_en?: string;
  name_bg?: string;
  image_url?: string;
  parent_id?: number | null;
}

export interface AdditionDraft {
  name: string;
  name_en?: string;
  name_bg?: string;
  price: number;
}

export interface ProductDraft {
  name: string;
  name_en?: string;
  name_bg?: string;
  price: number;
  description: string;
  description_en?: string;
  description_bg?: string;
  image_url?: string;
  is_available?: number;
  tags?: string;
  allergens?: string;
  calories?: number;
  is_featured?: number;
  is_new?: number;
  additions?: AdditionDraft[];
}

export interface RestaurantUpdatePayload {
  name: string;
  background_url?: string | null;
  logo_url?: string | null;
  logo_size?: number;
  logo_fit?: LogoFit;
  logo_position_x?: number;
  logo_position_y?: number;
  phone?: string | null;
  address?: string | null;
  wifi_password?: string | null;
  opening_hours?: string | null;
  facebook_url?: string | null;
  instagram_url?: string | null;
  takeover_enabled?: number;
  takeover_title?: string | null;
  takeover_message?: string | null;
  takeover_price?: string | null;
  takeover_allergens?: string | null;
  takeover_image_url?: string | null;
  footer_text?: string | null;
  footer_link?: string | null;
}

export interface PopularCategoryStats {
  enabled: boolean;
  current_period_key: string;
  popular_period_key: string;
  cutoff_hour: number;
  time_zone: string;
  active_category: Category | null;
  current_leader: (Category & { views: number }) | null;
  previous_winner: (Category & { views: number }) | null;
  current_period_views: number;
}

export const ALLERGEN_ICONS: Record<AllergenKey, string> = {
  gluten: "🌾",
  nuts: "🥜",
  dairy: "🥛",
  eggs: "🥚",
  fish: "🐟",
  soy: "🫛",
  sesame: "🌰",
  celery: "🥬",
};

export const ALLERGEN_LABELS: Record<AllergenKey, Record<Language, string>> = {
  gluten: { MK: "Глутен", BG: "Глутен", EN: "Gluten" },
  nuts: { MK: "Јаткасти плодови", BG: "Ядки", EN: "Nuts" },
  dairy: { MK: "Млечни", BG: "Млечни", EN: "Dairy" },
  eggs: { MK: "Јајца", BG: "Яйца", EN: "Eggs" },
  fish: { MK: "Риба", BG: "Риба", EN: "Fish" },
  soy: { MK: "Соја", BG: "Соя", EN: "Soy" },
  sesame: { MK: "Сусам", BG: "Сусам", EN: "Sesame" },
  celery: { MK: "Целер", BG: "Целина", EN: "Celery" },
};
