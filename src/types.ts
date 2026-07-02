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
  is_available?: number; // 1 = available, 0 = sold out
  tags?: string; // comma-separated: "vegan,spicy,popular,new"
  allergens?: string; // comma-separated: "gluten,nuts,dairy,eggs,fish,soy"
  calories?: number;
  is_featured?: number; // 1 = featured/popular
  is_new?: number; // 1 = new item
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

export type LogoFit = "contain" | "cover";

export interface Restaurant {
  id: number;
  name: string;
  slug: string;
  background_url?: string;
  logo_url?: string;
  logo_size?: number;
  logo_fit?: LogoFit;
  logo_position_x?: number;
  logo_position_y?: number;
  phone?: string;
  address?: string;
  wifi_password?: string;
  opening_hours?: string; // JSON string: { mon: "08:00-22:00", ... }
  facebook_url?: string;
  instagram_url?: string;
  popular_badges_enabled?: number;
  reviews_enabled?: number;
  takeover_enabled?: number;
  takeover_title?: string;
  takeover_message?: string;
  takeover_price?: string;
  takeover_allergens?: string; // comma-separated: "gluten,dairy"
  takeover_image_url?: string;
}

export type Language = "MK" | "BG" | "EN";

export type AllergenKey =
  | "gluten"
  | "nuts"
  | "dairy"
  | "eggs"
  | "fish"
  | "soy"
  | "sesame"
  | "celery";

export const ALLERGEN_ICONS: Record<AllergenKey, string> = {
  gluten: "🌾",
  nuts: "🥜",
  dairy: "🥛",
  eggs: "🥚",
  fish: "🐟",
  soy: "🫘",
  sesame: "🌰",
  celery: "🥬",
};

export interface Review {
  id: number;
  restaurant_id: number;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

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
