const Database = require("better-sqlite3");

/**
 * One-time helper to populate BG/EN fields for existing data.
 * Safe to re-run: it only fills fields that are NULL/empty.
 */
const db = new Database("menu.db");

const catTranslations = {
  1: { name_en: "Salads", name_bg: "Салати" },
  3: { name_en: "Salads", name_bg: "Салати" },
  4: { name_en: "Appetizers", name_bg: "Предястия" },
};

const productTranslations = {
  2: {
    name_en: "Shopska Salad",
    name_bg: "Шопска салата",
    description_en:
      "Traditional salad with tomatoes, cucumber, fresh pepper, and grated white cheese.",
    description_bg:
      "Традиционална салата с домати, краставица, свежа чушка и настъргано бяло сирене.",
  },
  3: {
    name_en: "Macedonian Salad",
    name_bg: "Македонска салата",
    description_en: "Fresh tomatoes, roasted peppers, onion, and parsley.",
    description_bg: "Свежи домати, печени чушки, лук и магданоз.",
  },
  4: {
    name_en: "Greek Salad",
    name_bg: "Гръцка салата",
    description_en: "Feta cheese, olives, cucumber, tomatoes, and oregano.",
    description_bg: "Сирене фета, маслини, краставица, домати и риган.",
  },
  5: {
    name_en: "Caesar Salad",
    name_bg: "Цезар салата",
    description_en:
      "Chicken fillet, lettuce, parmesan, and Caesar dressing with croutons.",
    description_bg:
      "Пилешко филе, маруля, пармезан и Цезар дресинг с крутони.",
  },
  6: {
    name_en: "Vitamin Salad",
    name_bg: "Витаминна салата",
    description_en: "Fresh grated carrot, beetroot, apple with lemon, and walnuts.",
    description_bg: "Прясно настърган морков, цвекло, ябълка с лимон и орехи.",
  },
  7: {
    name_en: "Mixed Salad",
    name_bg: "Мешана салата",
    description_en: "Seasonal mix of tomatoes, cucumber, cabbage, and carrot.",
    description_bg: "Сезонен микс от домати, краставица, зеле и морков.",
  },
};

const additionTranslations = {
  3: { name_en: "Extra cheese", name_bg: "Екстра сирене" },
  4: { name_en: "Olives", name_bg: "Маслини" },
  5: { name_en: "Hot peppers", name_bg: "Люти чушки" },
  6: { name_en: "Extra feta", name_bg: "Допълнителна фета" },
  7: { name_en: "Extra chicken", name_bg: "Екстра пилешко" },
  8: { name_en: "Bacon", name_bg: "Бекон" },
  9: { name_en: "Walnuts", name_bg: "Орехи" },
};

const tx = db.transaction(() => {
  const catStmt = db.prepare(
    "UPDATE categories SET name_en = COALESCE(NULLIF(TRIM(name_en), ''), ?), name_bg = COALESCE(NULLIF(TRIM(name_bg), ''), ?) WHERE id = ?",
  );
  const prodStmt = db.prepare(
    "UPDATE products SET name_en = COALESCE(NULLIF(TRIM(name_en), ''), ?), name_bg = COALESCE(NULLIF(TRIM(name_bg), ''), ?), description_en = COALESCE(NULLIF(TRIM(description_en), ''), ?), description_bg = COALESCE(NULLIF(TRIM(description_bg), ''), ?) WHERE id = ?",
  );
  const addStmt = db.prepare(
    "UPDATE additions SET name_en = COALESCE(NULLIF(TRIM(name_en), ''), ?), name_bg = COALESCE(NULLIF(TRIM(name_bg), ''), ?) WHERE id = ?",
  );

  for (const [idStr, tr] of Object.entries(catTranslations)) {
    const id = Number(idStr);
    catStmt.run(tr.name_en, tr.name_bg, id);
  }
  for (const [idStr, tr] of Object.entries(productTranslations)) {
    const id = Number(idStr);
    prodStmt.run(
      tr.name_en,
      tr.name_bg,
      tr.description_en,
      tr.description_bg,
      id,
    );
  }
  for (const [idStr, tr] of Object.entries(additionTranslations)) {
    const id = Number(idStr);
    addStmt.run(tr.name_en, tr.name_bg, id);
  }
});

tx();

const summary = {
  categories: db
    .prepare(
      "SELECT COUNT(*) c FROM categories WHERE name_en IS NOT NULL OR name_bg IS NOT NULL",
    )
    .get().c,
  products: db
    .prepare(
      "SELECT COUNT(*) c FROM products WHERE name_en IS NOT NULL OR name_bg IS NOT NULL OR description_en IS NOT NULL OR description_bg IS NOT NULL",
    )
    .get().c,
  additions: db
    .prepare(
      "SELECT COUNT(*) c FROM additions WHERE name_en IS NOT NULL OR name_bg IS NOT NULL",
    )
    .get().c,
};

console.log("✅ Filled translations (non-null rows):", summary);

