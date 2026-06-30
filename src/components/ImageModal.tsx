import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Tag, AlertCircle, Star, Sparkles } from "lucide-react";
import { Product, Language, ALLERGEN_ICONS, ALLERGEN_LABELS } from "../types";
import {
  getAllergenList,
  getLangValue,
  getTagList,
  isMissingTranslation,
} from "../utils/menuHelpers";

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  language: Language;
  darkMode?: boolean;
}

const DietaryBadge: React.FC<{ tag: string }> = ({ tag }) => {
  const config: Record<string, { emoji: string; color: string }> = {
    vegan: {
      emoji: "🌱",
      color: "bg-green-100 text-green-700 border-green-200",
    },
    vegetarian: {
      emoji: "🥗",
      color: "bg-lime-100 text-lime-700 border-lime-200",
    },
    spicy: { emoji: "🌶️", color: "bg-red-100 text-red-700 border-red-200" },
    "gluten-free": {
      emoji: "🚫🌾",
      color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    },
    halal: {
      emoji: "☪️",
      color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    },
    popular: {
      emoji: "⭐",
      color: "bg-amber-100 text-amber-700 border-amber-200",
    },
    new: { emoji: "✨", color: "bg-blue-100 text-blue-700 border-blue-200" },
    seafood: {
      emoji: "🦐",
      color: "bg-cyan-100 text-cyan-700 border-cyan-200",
    },
    meat: { emoji: "🥩", color: "bg-rose-100 text-rose-700 border-rose-200" },
  };
  const c = config[tag.toLowerCase()] || {
    emoji: "•",
    color: "bg-stone-100 text-stone-600 border-stone-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${c.color}`}
    >
      <span>{c.emoji}</span>
      <span>{tag}</span>
    </span>
  );
};

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  product,
  language,
  darkMode = false,
}) => {
  if (!product) return null;

  const t = (key: string): string => {
    const translations: Record<string, Record<Language, string>> = {
      details: {
        MK: "Детали за производот",
        BG: "Детайли за продукта",
        EN: "Product Details",
      },
      description: { MK: "Опис", BG: "Описание", EN: "Description" },
      additions: {
        MK: "Достапни додатоци",
        BG: "Налични добавки",
        EN: "Available Additions",
      },
      currency: { MK: "ден.", BG: "ДЕН.", EN: "DEN." },
      note: {
        MK: "* Цените се во денари (MKD)",
        BG: "* Цените са в денари (MKD)",
        EN: "* Prices are in Denar (MKD)",
      },
      no_image: {
        MK: "Нема достапна слика",
        BG: "Няма налична снимка",
        EN: "No Image Available",
      },
      allergens: { MK: "Алергени", BG: "Алергени", EN: "Allergens" },
      calories: { MK: "Калории", BG: "Калории", EN: "Calories" },
      sold_out: { MK: "Распродадено", BG: "Изчерпано", EN: "Sold Out" },
      featured: { MK: "Популарно", BG: "Популярно", EN: "Popular" },
      new_item: { MK: "Ново", BG: "Ново", EN: "New" },
      tags: { MK: "Ознаки", BG: "Тагове", EN: "Tags" },
    };
    return translations[key]?.[language] || key;
  };

  const isAvailable = product.is_available !== 0;
  const isFeatured = product.is_featured === 1;
  const isNew = product.is_new === 1;
  const allergens = getAllergenList(product.allergens);
  const tags = getTagList(product.tags);
  const descMissingTranslation = isMissingTranslation(
    product,
    "description",
    language,
  );

  const panelBg = darkMode
    ? "bg-stone-900 text-stone-100"
    : "bg-white text-stone-900";
  const mutedText = darkMode ? "text-stone-400" : "text-stone-500";
  const labelText = darkMode ? "text-stone-500" : "text-stone-400";
  const dividerColor = darkMode ? "border-stone-700" : "border-stone-100";
  const additionRowColor = darkMode
    ? "border-stone-700 text-stone-400"
    : "border-stone-100 text-stone-600";
  const priceBg = darkMode
    ? "bg-stone-800 text-stone-200"
    : "bg-stone-50 text-stone-800";
  const imgBg = darkMode ? "bg-stone-800" : "bg-stone-100";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop – instant blur on open */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
            className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xl cursor-zoom-out"
            onClick={onClose}
          />

          {/* Modal card – spring slide-in */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 overflow-y-auto pointer-events-none">
          <motion.div
            key="card"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className={`relative w-full max-w-4xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[460px] pointer-events-auto ${panelBg}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              aria-label="Close product details"
              className={`absolute top-5 right-5 z-20 p-2.5 rounded-full transition-all
                ${
                  darkMode
                    ? "bg-stone-700/80 text-stone-300 hover:bg-stone-600 hover:text-white"
                    : "bg-white/20 backdrop-blur-md text-white md:bg-stone-100/70 md:text-stone-500 md:hover:bg-stone-200"
                }`}
            >
              <X size={18} />
            </button>

            {/* Left – Image */}
            <div
              className={`w-full md:w-1/2 relative ${imgBg} flex items-center justify-center min-h-[260px] md:min-h-full overflow-hidden`}
            >
              {product.image_url ? (
                <>
                  <img
                    src={product.image_url}
                    alt={getLangValue(product, "name", language)}
                    loading="lazy"
                    decoding="async"
                    className={`w-full h-full object-cover transition-all ${!isAvailable ? "grayscale opacity-60" : ""}`}
                    style={{ minHeight: 260, maxHeight: 520 }}
                  />
                  {!isAvailable && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="bg-stone-900/80 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-full flex items-center gap-2">
                        <AlertCircle size={14} /> {t("sold_out")}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div
                  className={`flex flex-col items-center gap-3 ${labelText}`}
                >
                  <Tag size={48} className="opacity-40" />
                  <span className="text-[10px] uppercase tracking-widest font-bold opacity-60">
                    {t("no_image")}
                  </span>
                </div>
              )}
            </div>

            {/* Right – Details */}
            <div
              className={`w-full md:w-1/2 flex flex-col justify-between p-8 md:p-10 overflow-y-auto`}
            >
              <div className="space-y-6">
                {/* Header label */}
                <p
                  className={`text-[10px] uppercase tracking-[0.3em] font-bold ${labelText}`}
                >
                  {t("details")}
                </p>

                {/* Status badges */}
                {(isFeatured || isNew || !isAvailable) && (
                  <div className="flex flex-wrap gap-1.5 -mt-2">
                    {isFeatured && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        <Star size={9} /> {t("featured")}
                      </span>
                    )}
                    {isNew && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                        <Sparkles size={9} /> {t("new_item")}
                      </span>
                    )}
                    {!isAvailable && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-stone-200 text-stone-500 border border-stone-300">
                        <AlertCircle size={9} /> {t("sold_out")}
                      </span>
                    )}
                  </div>
                )}

                {/* Name + Price */}
                <div>
                  <h2 className="text-3xl md:text-4xl font-serif leading-tight mb-3">
                    {getLangValue(product, "name", language)}
                  </h2>
                  <div
                    className={`inline-flex items-baseline gap-1.5 px-4 py-2 rounded-xl font-mono ${priceBg}`}
                  >
                    <span className="text-2xl font-bold">
                      {product.price.toFixed(0)}
                    </span>
                    <span className="text-xs font-bold uppercase opacity-60">
                      {t("currency")}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {getLangValue(product, "description", language) && (
                  <section>
                    <h3
                      className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${labelText}`}
                    >
                      {t("description")}
                    </h3>
                    <p className={`leading-relaxed text-sm ${mutedText}`}>
                      {getLangValue(product, "description", language)}
                    </p>
                    {descMissingTranslation && (
                      <p
                        className={`mt-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${labelText}`}
                      >
                        {language === "EN"
                          ? "Not translated yet"
                          : language === "BG"
                            ? "Няма превод"
                            : "Нема превод"}
                      </p>
                    )}
                  </section>
                )}

                {/* Calories */}
                {product.calories && (
                  <div
                    className={`flex items-center gap-2 text-sm ${mutedText}`}
                  >
                    <span
                      className={`text-[10px] uppercase tracking-widest font-bold ${labelText}`}
                    >
                      {t("calories")}:
                    </span>
                    <span className="font-mono font-bold">
                      {product.calories} kcal
                    </span>
                  </div>
                )}

                {/* Dietary Tags */}
                {tags.length > 0 && (
                  <section>
                    <h3
                      className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${labelText}`}
                    >
                      {t("tags")}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <DietaryBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  </section>
                )}

                {/* Allergens */}
                {allergens.length > 0 && (
                  <section>
                    <h3
                      className={`text-[10px] uppercase tracking-widest font-bold mb-2 ${labelText}`}
                    >
                      {t("allergens")}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {allergens.map((a: any) => (
                        <span
                          key={a}
                          title={
                            ALLERGEN_LABELS[
                              a as keyof typeof ALLERGEN_LABELS
                            ]?.[language] || a
                          }
                          className={`text-2xl cursor-help select-none`}
                        >
                          {ALLERGEN_ICONS[a as keyof typeof ALLERGEN_ICONS]}
                        </span>
                      ))}
                    </div>
                    <p className={`text-[10px] mt-1 ${labelText}`}>
                      {allergens
                        .map(
                          (a: any) =>
                            ALLERGEN_LABELS[
                              a as keyof typeof ALLERGEN_LABELS
                            ]?.[language] || a,
                        )
                        .join(", ")}
                    </p>
                  </section>
                )}

                {/* Additions */}
                {product.additions && product.additions.length > 0 && (
                  <section>
                    <h3
                      className={`text-[10px] uppercase tracking-widest font-bold mb-3 ${labelText}`}
                    >
                      {t("additions")}
                    </h3>
                    <div className="space-y-0">
                      {product.additions.map((add, i) => (
                        <div
                          key={i}
                          className={`flex justify-between items-center py-2.5 border-b last:border-0 ${additionRowColor}`}
                        >
                          <span className="font-medium text-sm truncate pr-3 min-w-0">
                            + {getLangValue(add, "name", language)}
                          </span>
                          <span className={`font-mono text-xs ${mutedText}`}>
                            {add.price.toFixed(0)} {t("currency")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* Footer note */}
              <div className={`mt-8 pt-6 border-t ${dividerColor}`}>
                <p
                  className={`text-[9px] uppercase tracking-[0.2em] font-medium ${labelText}`}
                >
                  {t("note")}
                </p>
              </div>
            </div>
          </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
