import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  Plus,
  Trash2,
  ExternalLink,
  QrCode,
  Maximize2,
  Pencil,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  GripVertical,
  FileUp,
  Loader2,
  Download,
  Image as ImageIcon,
  X,
  Lock,
  LogOut,
  Eye,
  EyeOff,
  Info,
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { Restaurant, Category, Product } from "../types";
import { ImageModal } from "./ImageModal";

interface CategorySectionProps {
  category: Category;
  parentId?: number | null;
  index: number;
  onDelete: (id: number, parentId?: number | null) => void;
  onUpdateCategory: (id: number, data: any, parentId?: number | null) => void;
  onAddProduct: (categoryId: number, p: any, parentId?: number | null) => void;
  onUpdateProduct: (
    productId: number,
    categoryId: number,
    p: any,
    parentId?: number | null,
  ) => void;
  onDeleteProduct: (
    productId: number,
    categoryId: number,
    parentId?: number | null,
  ) => void;
  onMoveProduct: (
    categoryId: number,
    productId: number,
    direction: "up" | "down",
    parentId?: number | null,
  ) => void;
  onMoveCategory: (
    idx: number,
    direction: "up" | "down",
    parentId?: number | null,
  ) => void;
  onAddSubcategory: (parentId: number, name: string) => void;
  onReorderSubcategories: (parentId: number, newOrder: Category[]) => void;
  onBulkImport: (categoryId: number, products: any[]) => Promise<void>;
  isExpanded: boolean;
  onToggle: () => void;
  isSubcategory?: boolean;
}

const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  parentId = null,
  index,
  onDelete,
  onUpdateCategory,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onMoveProduct,
  onMoveCategory,
  onAddSubcategory,
  onReorderSubcategories,
  onBulkImport,
  isExpanded,
  onToggle,
  isSubcategory = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: "idle" | "info" | "success" | "error";
    message: string;
  } | null>(null);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [isAddingSubcategory, setIsAddingSubcategory] = useState(false);
  const [categoryEditData, setCategoryEditData] = useState({
    name: category.name,
    name_en: category.name_en || "",
    name_bg: category.name_bg || "",
    image_url: category.image_url || "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProd, setNewProd] = useState({
    name: "",
    name_en: "",
    name_bg: "",
    price: "",
    description: "",
    description_en: "",
    description_bg: "",
    image_url: "",
    hasAdditions: false,
    additions: [{ name: "", name_en: "", name_bg: "", price: "" }],
    is_available: 1,
    tags: "",
    allergens: "",
    calories: "",
    is_featured: 0,
    is_new: 0,
  });
  const [selectedProductForModal, setSelectedProductForModal] =
    useState<Product | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewProd({ ...newProd, image_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!newProd.name || !newProd.price) return;

    const finalAdditions = newProd.hasAdditions
      ? newProd.additions
          .filter((a) => a.name.trim() !== "")
          .map((a) => ({
            name: a.name,
            name_en: a.name_en,
            name_bg: a.name_bg,
            price: parseFloat(a.price) || 0,
          }))
      : [];

    const productData = {
      name: newProd.name,
      name_en: newProd.name_en,
      name_bg: newProd.name_bg,
      price: parseFloat(newProd.price),
      description: newProd.description,
      description_en: newProd.description_en,
      description_bg: newProd.description_bg,
      image_url: newProd.image_url,
      additions: finalAdditions,
      is_available: newProd.is_available,
      tags: newProd.tags,
      allergens: newProd.allergens,
      calories: newProd.calories ? parseInt(newProd.calories) : null,
      is_featured: newProd.is_featured,
      is_new: newProd.is_new,
    };

    if (editingProduct) {
      onUpdateProduct(editingProduct.id, category.id, productData, parentId);
    } else {
      onAddProduct(category.id, productData, parentId);
    }

    resetForm();
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    setNewProd({
      name: product.name,
      name_en: product.name_en || "",
      name_bg: product.name_bg || "",
      price: product.price.toString(),
      description: product.description || "",
      description_en: product.description_en || "",
      description_bg: product.description_bg || "",
      image_url: product.image_url || "",
      is_available: product.is_available ?? 1,
      tags: product.tags || "",
      allergens: product.allergens || "",
      calories: product.calories?.toString() || "",
      is_featured: product.is_featured ?? 0,
      is_new: product.is_new ?? 0,
      hasAdditions: (product.additions?.length || 0) > 0,
      additions:
        (product.additions?.length || 0) > 0
          ? product.additions!.map((a) => ({
              name: a.name,
              name_en: a.name_en || "",
              name_bg: a.name_bg || "",
              price: a.price.toString(),
            }))
          : [{ name: "", name_en: "", name_bg: "", price: "" }],
    });
    setIsAdding(true);
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingProduct(null);
    setNewProd({
      name: "",
      name_en: "",
      name_bg: "",
      price: "",
      description: "",
      description_en: "",
      description_bg: "",
      image_url: "",
      is_available: 1,
      tags: "",
      allergens: "",
      calories: "",
      is_featured: 0,
      is_new: 0,
      hasAdditions: false,
      additions: [{ name: "", name_en: "", name_bg: "", price: "" }],
    });
  };

  const updateAddition = (
    idx: number,
    field: "name" | "name_en" | "name_bg" | "price",
    value: string,
  ) => {
    const updated = [...newProd.additions];
    updated[idx] = { ...updated[idx], [field]: value };
    setNewProd({ ...newProd, additions: updated });
  };

  const addAdditionRow = () => {
    setNewProd({
      ...newProd,
      additions: [
        ...newProd.additions,
        { name: "", name_en: "", name_bg: "", price: "" },
      ],
    });
  };

  const removeAdditionRow = (idx: number) => {
    if (newProd.additions.length === 1) {
      setNewProd({
        ...newProd,
        additions: [{ name: "", name_en: "", name_bg: "", price: "" }],
      });
    } else {
      setNewProd({
        ...newProd,
        additions: newProd.additions.filter((_, i) => i !== idx),
      });
    }
  };

  const handleCategoryImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCategoryEditData({
          ...categoryEditData,
          image_url: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCategory = async () => {
    await onUpdateCategory(category.id, categoryEditData, parentId);
    setIsEditingCategory(false);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({ type: "info", message: `Reading ${file.name}...` });
    setIsImporting(true);

    const reader = new FileReader();

    reader.onerror = (err) => {
      console.error("Reader Error:", err);
      setImportStatus({ type: "error", message: "Failed to read the file." });
      setIsImporting(false);
      inputEl.value = "";
    };

    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string;
        if (!text) {
          setImportStatus({ type: "error", message: "File is empty." });
          return;
        }

        console.log("CSV raw text length:", text.length);

        // Normalize text
        if (text.startsWith("\uFEFF")) text = text.substring(1);
        const lines = text
          .split(/\r?\n|\r/)
          .map((l) => l.trim())
          .filter((l) => l !== "");

        if (lines.length < 1) {
          setImportStatus({
            type: "error",
            message: "No lines found in the file.",
          });
          return;
        }

        let firstLineIdx = 0;
        let delimiter = ",";

        if (lines[0].toLowerCase().startsWith("sep=")) {
          delimiter = lines[0].substring(4).trim() || ",";
          firstLineIdx = 1;
        } else {
          const firstLine = lines[0];
          const commaCount = (firstLine.match(/,/g) || []).length;
          const semicolonCount = (firstLine.match(/;/g) || []).length;
          delimiter = semicolonCount > commaCount ? ";" : ",";
        }

        const headers = lines[firstLineIdx].split(delimiter).map(h => h.trim().toLowerCase());
        const findColIdx = (key: string) => {
          const map: Record<string, string[]> = {
            title: ['title', 'наслов', 'име', 'name', 'производ', 'назив', 'product'],
            title_en: ['title_en', 'name_en'],
            title_bg: ['title_bg', 'name_bg'],
            description: ['description', 'опис', 'детали', 'инфо'],
            description_en: ['description_en', 'desc_en'],
            description_bg: ['description_bg', 'desc_bg'],
            price: ['price', 'цена', 'износ', 'price_mdn'],
            image: ['image', 'слика', 'image_url', 'фото', 'url'],
            additions: ['additions', 'додатоци', 'додаток', 'extra']
          };
          const matches = map[key] || [key];
          return headers.findIndex(h => matches.includes(h));
        };

        const idx = {
          title: findColIdx('title'),
          title_en: findColIdx('title_en'),
          title_bg: findColIdx('title_bg'),
          desc: findColIdx('description'),
          desc_en: findColIdx('description_en'),
          desc_bg: findColIdx('description_bg'),
          price: findColIdx('price'),
          img: findColIdx('image'),
          adds: findColIdx('additions')
        };

        if (idx.title === -1) {
          setImportStatus({
            type: "error",
            message: `Could not find product name column. Headers: ${headers.join(", ")}`,
          });
          return;
        }

        const parsed = lines
          .slice(firstLineIdx + 1)
          .map((line) => {
            const values: string[] = [];
            let current = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                const next = line[i + 1];
                if (inQuotes && next === '"') {
                  current += '"';
                  i++;
                } else {
                  inQuotes = !inQuotes;
                }
              } else if (char === delimiter && !inQuotes) {
                values.push(current.trim());
                current = "";
              } else current += char;
            }
            values.push(current.trim());

            const getV = (idx: number) =>
              idx !== -1 && values[idx]
                ? values[idx].replace(/^"|"$/g, "").trim()
                : "";
            const title = getV(idx.title);
            if (!title) return null;

            const priceStr = getV(idx.price).replace(/[^0-9.]/g, '');
            const additionsStr = getV(idx.adds);
            const additions = additionsStr
              ? additionsStr
                  .split(';')
                  .map((a) => {
                    const parts = a.split(':');
                    const rawNames = (parts[0] || "").trim();
                    const nameParts = rawNames.split('|').map((s) => s.trim());
                    const name = (nameParts[0] || "").trim();
                    const name_en = (nameParts[1] || "").trim();
                    const name_bg = (nameParts[2] || "").trim();

                    return {
                      name,
                      name_en,
                      name_bg,
                      price: parts[1]
                        ? parseFloat(parts[1].replace(/[^0-9.]/g, ''))
                        : 0,
                    };
                  })
                  .filter((a) => a.name !== "")
              : [];

            return {
              name: title,
              name_en: getV(idx.title_en),
              name_bg: getV(idx.title_bg),
              description: getV(idx.desc),
              description_en: getV(idx.desc_en),
              description_bg: getV(idx.desc_bg),
              price: parseFloat(priceStr) || 0,
              image_url: getV(idx.img),
              additions: additions
            };
          })
          .filter((p) => p !== null);

        if (parsed.length === 0) {
          setImportStatus({
            type: "error",
            message: "No products were parsed from the CSV.",
          });
          return;
        }

        setImportStatus({
          type: "info",
          message: `Parsed ${parsed.length} products. Uploading...`,
        });
        await onBulkImport(category.id, parsed as any[]);
        setImportStatus({
          type: "success",
          message: `Imported ${parsed.length} products.`,
        });
      } catch (err: any) {
        setImportStatus({
          type: "error",
          message: err?.message ? String(err.message) : "Import failed.",
        });
      } finally {
        setIsImporting(false);
        inputEl.value = "";
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleCsvExport = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Build filename from category name directly — no need to parse server headers
    const safeName = (category.name || "products").replace(
      /[\\/:*?"<>|]+/g,
      "-",
    );
    const filename = `${safeName}.csv`;

    try {
      const res = await fetch(`/api/categories/${category.id}/products/export`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setImportStatus({ type: "success", message: `Exported: ${filename}` });
    } catch (err: any) {
      setImportStatus({
        type: "error",
        message: `Export failed: ${err.message}`,
      });
    }
    setTimeout(() => setImportStatus(null), 3000);
  };

  const handleSaveSubcategory = () => {
    if (!newSubcategoryName.trim()) return;
    onAddSubcategory(category.id, newSubcategoryName);
    setNewSubcategoryName("");
    setIsAddingSubcategory(false);
  };

  return (
    <div
      className={`bg-white rounded-3xl border border-stone-200 overflow-hidden ${isSubcategory ? "ml-8 border-stone-100 shadow-sm" : ""}`}
    >
      <div
        className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 cursor-pointer hover:bg-stone-100/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 text-stone-300 cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={20} />
            <div className="flex flex-col">
              <button
                onClick={() => onMoveCategory(index, "up", parentId)}
                className="hover:text-stone-600 transition-colors"
              >
                <ChevronUp size={14} />
              </button>
              <button
                onClick={() => onMoveCategory(index, "down", parentId)}
                className="hover:text-stone-600 transition-colors"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown size={18} className="text-stone-400" />
            ) : (
              <ChevronRight size={18} className="text-stone-400" />
            )}
            {category.image_url && (
              <img
                src={category.image_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover border border-stone-200"
              />
            )}
            <h2 className="text-xl font-serif">{category.name}</h2>
          </div>
        </div>
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          {importStatus && (
            <div
              className={`max-w-[220px] truncate text-[10px] ${importStatus.type === "error" ? "text-red-500" : importStatus.type === "success" ? "text-green-600" : "text-stone-500"}`}
              title={importStatus.message}
            >
              {importStatus.message}
            </div>
          )}
          <div className="relative">
            <button
              className={`text-stone-400 hover:text-stone-900 transition-colors p-2 ${isImporting ? "animate-spin" : ""}`}
              title="Import Products (CSV)"
            >
              {isImporting ? <Loader2 size={18} /> : <FileUp size={18} />}
            </button>
            <input
              type="file"
              accept=".csv,.CSV,text/csv"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={handleCsvImport}
            />
          </div>
          <button
            onClick={handleCsvExport}
            className="text-stone-400 hover:text-stone-900 transition-colors p-2"
            title="Export Products (CSV)"
          >
            <Download size={18} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingCategory(!isEditingCategory);
            }}
            className="text-stone-400 hover:text-stone-900 transition-colors p-2"
            title="Edit Category"
          >
            <Pencil size={18} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!isExpanded) onToggle();
              setIsAdding(!isAdding);
            }}
            className="text-stone-500 hover:text-stone-900 transition-colors p-2"
          >
            <Plus size={20} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(true);
            }}
            className="text-stone-300 hover:text-red-500 transition-colors p-2"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isEditingCategory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-stone-50 p-6 border-b border-stone-100 space-y-4"
          >
            <h4 className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              Edit Category
            </h4>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                    MK
                  </label>
                  <input
                    type="text"
                    placeholder="Macedonian Name"
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                    value={categoryEditData.name}
                    onChange={(e) =>
                      setCategoryEditData({
                        ...categoryEditData,
                        name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                    BG
                  </label>
                  <input
                    type="text"
                    placeholder="Bulgarian Name"
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                    value={categoryEditData.name_bg}
                    onChange={(e) =>
                      setCategoryEditData({
                        ...categoryEditData,
                        name_bg: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                    EN
                  </label>
                  <input
                    type="text"
                    placeholder="English Name"
                    className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                    value={categoryEditData.name_en}
                    onChange={(e) =>
                      setCategoryEditData({
                        ...categoryEditData,
                        name_en: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCategoryImageUpload}
                  className="text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"
                />
                {categoryEditData.image_url && (
                  <img
                    src={categoryEditData.image_url}
                    alt="Preview"
                    className="w-10 h-10 object-cover rounded-full border border-stone-200"
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsEditingCategory(false)}
                className="px-4 py-2 text-xs text-stone-400 uppercase tracking-widest font-bold hover:text-stone-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                className="bg-stone-900 text-stone-50 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-serif mb-2">Delete Category?</h3>
              <p className="text-stone-500 text-sm mb-8">
                Are you sure you want to delete{" "}
                <span className="font-bold text-stone-900">
                  "{category.name}"
                </span>
                ? This will also delete all products within this category.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-stone-400 hover:text-stone-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDelete(category.id, parentId);
                    setShowDeleteConfirm(false);
                  }}
                  className="flex-1 bg-red-500 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="p-6 space-y-4">
              {!isSubcategory && (
                <div className="pb-4 border-b border-stone-100">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                      Subcategories
                    </h4>
                    <button
                      onClick={() =>
                        setIsAddingSubcategory(!isAddingSubcategory)
                      }
                      className="text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
                    >
                      <Plus size={14} /> Add Subcategory
                    </button>
                  </div>

                  <AnimatePresence>
                    {isAddingSubcategory && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex gap-2 mb-4"
                      >
                        <input
                          type="text"
                          placeholder="Subcategory Name"
                          className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400"
                          value={newSubcategoryName}
                          onChange={(e) =>
                            setNewSubcategoryName(e.target.value)
                          }
                          onKeyPress={(e) =>
                            e.key === "Enter" && handleSaveSubcategory()
                          }
                        />
                        <button
                          onClick={handleSaveSubcategory}
                          className="bg-stone-900 text-stone-50 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors"
                        >
                          Add
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {category.subcategories &&
                  category.subcategories.length > 0 ? (
                    <Reorder.Group
                      axis="y"
                      values={category.subcategories}
                      onReorder={(newOrder) =>
                        onReorderSubcategories(category.id, newOrder)
                      }
                      className="space-y-4"
                    >
                      {category.subcategories.map((sub, idx) => (
                        <Reorder.Item key={sub.id} value={sub}>
                          <CategorySection
                            category={sub}
                            parentId={category.id}
                            index={idx}
                            isSubcategory={true}
                            onDelete={onDelete}
                            onUpdateCategory={onUpdateCategory}
                            onAddProduct={onAddProduct}
                            onUpdateProduct={onUpdateProduct}
                            onDeleteProduct={onDeleteProduct}
                            onMoveProduct={onMoveProduct}
                            onMoveCategory={onMoveCategory}
                            onAddSubcategory={onAddSubcategory}
                            onReorderSubcategories={onReorderSubcategories}
                            onBulkImport={onBulkImport}
                            isExpanded={false}
                            onToggle={() => {}}
                          />
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  ) : (
                    !isAddingSubcategory && (
                      <p className="text-stone-400 text-[10px] italic text-center py-2">
                        No subcategories yet.
                      </p>
                    )
                  )}
                </div>
              )}

              <div className="flex items-center justify-between">
                <h4 className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                  Products
                </h4>
                {!isAdding && (
                  <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="text-stone-500 hover:text-stone-900 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-widest"
                  >
                    <Plus size={14} /> Add Product
                  </button>
                )}
              </div>

              {isAdding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-stone-50 p-6 rounded-2xl space-y-4 mb-4 border border-stone-100"
                >
                  <h4 className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mb-2">
                    {editingProduct ? "Edit Product" : "Add New Product"}
                  </h4>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          MK Name
                        </label>
                        <input
                          type="text"
                          placeholder="MK Name"
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={newProd.name}
                          onChange={(e) =>
                            setNewProd({ ...newProd, name: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          BG Name
                        </label>
                        <input
                          type="text"
                          placeholder="BG Name"
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={newProd.name_bg}
                          onChange={(e) =>
                            setNewProd({ ...newProd, name_bg: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          EN Name
                        </label>
                        <input
                          type="text"
                          placeholder="EN Name"
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={newProd.name_en}
                          onChange={(e) =>
                            setNewProd({ ...newProd, name_en: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div className="relative w-full md:w-1/3">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          Price
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="Price"
                            className="w-full bg-white border border-stone-200 rounded-lg pl-3 pr-12 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={newProd.price}
                            onChange={(e) =>
                              setNewProd({ ...newProd, price: e.target.value })
                            }
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 font-bold uppercase">
                            ден.
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                            MK Description
                          </label>
                          <input
                            type="text"
                            placeholder="MK Description"
                            className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={newProd.description}
                            onChange={(e) =>
                              setNewProd({
                                ...newProd,
                                description: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                            BG Description
                          </label>
                          <input
                            type="text"
                            placeholder="BG Description"
                            className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={newProd.description_bg}
                            onChange={(e) =>
                              setNewProd({
                                ...newProd,
                                description_bg: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                            EN Description
                          </label>
                          <input
                            type="text"
                            placeholder="EN Description"
                            className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                            value={newProd.description_en}
                            onChange={(e) =>
                              setNewProd({
                                ...newProd,
                                description_en: e.target.value,
                              })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          Tags (comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. vegan, spicy, gluten-free"
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={newProd.tags}
                          onChange={(e) =>
                            setNewProd({ ...newProd, tags: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          Allergens (comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. gluten, nuts, dairy"
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={newProd.allergens}
                          onChange={(e) =>
                            setNewProd({
                              ...newProd,
                              allergens: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          Calories
                        </label>
                        <input
                          type="number"
                          placeholder="e.g. 450"
                          className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:outline-none"
                          value={newProd.calories}
                          onChange={(e) =>
                            setNewProd({ ...newProd, calories: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex gap-6 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newProd.is_featured === 1}
                          onChange={(e) =>
                            setNewProd({
                              ...newProd,
                              is_featured: e.target.checked ? 1 : 0,
                            })
                          }
                        />
                        <span className="text-sm">Featured</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newProd.is_new === 1}
                          onChange={(e) =>
                            setNewProd({
                              ...newProd,
                              is_new: e.target.checked ? 1 : 0,
                            })
                          }
                        />
                        <span className="text-sm">New</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newProd.is_available === 0}
                          onChange={(e) =>
                            setNewProd({
                              ...newProd,
                              is_available: e.target.checked ? 0 : 1,
                            })
                          }
                        />
                        <span className="text-sm">Sold Out</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-stone-200/50 space-y-4">
                    <div
                      className="flex items-center gap-3 group cursor-pointer"
                      onClick={() =>
                        setNewProd({
                          ...newProd,
                          hasAdditions: !newProd.hasAdditions,
                        })
                      }
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${newProd.hasAdditions ? "bg-stone-900 border-stone-900" : "border-stone-300"}`}
                      >
                        {newProd.hasAdditions && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-stone-600">
                        This product has additions
                      </span>
                    </div>

                    <AnimatePresence>
                      {newProd.hasAdditions && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-3 pl-8"
                        >
                          <h5 className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                            Additions
                          </h5>
                          {newProd.additions.map((addition, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col gap-2 p-3 bg-white border border-stone-200 rounded-xl"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input
                                  type="text"
                                  placeholder="MK Name"
                                  className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm"
                                  value={addition.name}
                                  onChange={(e) =>
                                    updateAddition(idx, "name", e.target.value)
                                  }
                                />
                                <input
                                  type="text"
                                  placeholder="BG Name"
                                  className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm"
                                  value={addition.name_bg}
                                  onChange={(e) =>
                                    updateAddition(
                                      idx,
                                      "name_bg",
                                      e.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  placeholder="EN Name"
                                  className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm"
                                  value={addition.name_en}
                                  onChange={(e) =>
                                    updateAddition(
                                      idx,
                                      "name_en",
                                      e.target.value,
                                    )
                                  }
                                />
                              </div>
                              <div className="flex justify-between items-center gap-3">
                                <div className="relative w-32">
                                  <input
                                    type="number"
                                    placeholder="Price"
                                    className="w-full bg-stone-50 border border-stone-200 rounded-lg pl-3 pr-12 py-2 text-sm"
                                    value={addition.price}
                                    onChange={(e) =>
                                      updateAddition(
                                        idx,
                                        "price",
                                        e.target.value,
                                      )
                                    }
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 font-bold uppercase">
                                    ден.
                                  </span>
                                </div>
                                <button
                                  onClick={() => removeAdditionRow(idx)}
                                  className="text-stone-300 hover:text-red-500 transition-colors p-2"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={addAdditionRow}
                            className="text-xs text-stone-500 font-bold uppercase tracking-widest flex items-center gap-2 hover:text-stone-900 transition-colors pt-1"
                          >
                            <Plus size={14} /> Add another addition
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-stone-200/50">
                    <label className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
                      Product Image
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"
                      />
                      {newProd.image_url && (
                        <img
                          src={newProd.image_url}
                          alt="Preview"
                          className="w-12 h-12 object-cover rounded-lg border border-stone-200"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-stone-200/50">
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 text-xs text-stone-400 uppercase tracking-widest font-bold hover:text-stone-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      className="bg-stone-900 text-stone-50 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-800 transition-colors shadow-sm"
                    >
                      {editingProduct ? "Update Product" : "Add Product"}
                    </button>
                  </div>
                </motion.div>
              )}

              {category.products.length === 0 && !isAdding && (
                <p className="text-stone-400 text-sm text-center py-4">
                  No products in this category yet.
                </p>
              )}

              <div className="divide-y divide-stone-100">
                {category.products.map((product) => (
                  <div
                    key={product.id}
                    className="py-4 flex items-start gap-4 justify-between group"
                  >
                    {product.image_url && (
                      <div
                        className="relative group/img cursor-zoom-in"
                        onClick={() => setSelectedProductForModal(product)}
                      >
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded-xl border border-stone-100"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                          <Maximize2 size={16} className="text-white" />
                        </div>
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{product.name}</h3>
                        <span className="text-stone-400 text-sm font-mono">
                          {product.price.toFixed(0)} ден.
                        </span>
                      </div>
                      <p className="text-stone-500 text-sm mt-1">
                        {product.description}
                      </p>
                      <div className="flex gap-2 mt-1">
                        {product.is_available === 0 && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium uppercase tracking-widest">
                            Sold Out
                          </span>
                        )}
                        {product.is_featured === 1 && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium uppercase tracking-widest">
                            Featured
                          </span>
                        )}
                        {product.is_new === 1 && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium uppercase tracking-widest">
                            New
                          </span>
                        )}
                      </div>
                      {product.additions && product.additions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {product.additions.map((add, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full font-medium"
                            >
                              +{add.name} ({add.price.toFixed(0)} ден.)
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() =>
                            onMoveProduct(
                              category.id,
                              product.id,
                              "up",
                              parentId,
                            )
                          }
                          className="text-stone-300 hover:text-stone-900 transition-colors p-1"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() =>
                            onMoveProduct(
                              category.id,
                              product.id,
                              "down",
                              parentId,
                            )
                          }
                          className="text-stone-300 hover:text-stone-900 transition-colors p-1"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          onUpdateProduct(
                            product.id,
                            category.id,
                            {
                              ...product,
                              is_available: product.is_available === 0 ? 1 : 0,
                            },
                            parentId,
                          );
                        }}
                        className={`transition-colors p-2 ${product.is_available === 0 ? "text-red-500 hover:text-green-500" : "text-stone-300 hover:text-red-500"}`}
                        title={
                          product.is_available === 0
                            ? "Mark Available"
                            : "Mark Sold Out"
                        }
                      >
                        <AlertTriangle size={16} />
                      </button>
                      <button
                        onClick={() => startEdit(product)}
                        className="text-stone-300 hover:text-stone-900 transition-colors p-2"
                        title="Edit Product"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() =>
                          onDeleteProduct(product.id, category.id, parentId)
                        }
                        className="text-stone-200 hover:text-red-500 transition-colors p-2"
                        title="Delete Product"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ImageModal
        isOpen={!!selectedProductForModal}
        onClose={() => setSelectedProductForModal(null)}
        product={selectedProductForModal}
      />
    </div>
  );
};

export default function AdminPanel() {
  const { slug } = useParams<{ slug: string }>();
  const [authStatus, setAuthStatus] = useState<
    "checking" | "authenticated" | "unauthenticated"
  >("checking");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(
    null,
  );
  const [isEditingRestaurant, setIsEditingRestaurant] = useState(false);
  const [editRestaurantName, setEditRestaurantName] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  type ReorderType = "categories" | "products";
  const reorderTimeoutsRef = React.useRef<
    Partial<Record<ReorderType, ReturnType<typeof setTimeout>>>
  >({});
  const pendingReordersRef = React.useRef<Partial<Record<ReorderType, number[]>>>(
    {},
  );

  const saveReorder = async (
    type: ReorderType,
    ids: number[],
    keepalive = false,
  ) => {
    const res = await fetch(`/api/${type}/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
      keepalive,
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || `Failed to save ${type} order`);
    }
  };

  const debouncedReorder = (type: ReorderType, ids: number[]) => {
    const existingTimer = reorderTimeoutsRef.current[type];
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    pendingReordersRef.current[type] = ids;

    reorderTimeoutsRef.current[type] = setTimeout(async () => {
      const pendingIds = pendingReordersRef.current[type];
      if (!pendingIds) return;
      delete pendingReordersRef.current[type];

      try {
        await saveReorder(type, pendingIds);
      } catch (error) {
        console.error(`Error reordering ${type}:`, error);
        alert(`Could not save the new ${type} order. Please try again.`);
      }
    }, 150);
  };

  useEffect(() => {
    const flushPendingReorders = () => {
      (Object.entries(pendingReordersRef.current) as [ReorderType, number[]][])
        .filter(([, ids]) => ids?.length)
        .forEach(([type, ids]) => {
          const timer = reorderTimeoutsRef.current[type];
          if (timer) clearTimeout(timer);
          void saveReorder(type, ids, true).catch((error) => {
            console.error(`Error flushing ${type} reorder:`, error);
          });
        });
      pendingReordersRef.current = {};
    };

    window.addEventListener("pagehide", flushPendingReorders);
    return () => window.removeEventListener("pagehide", flushPendingReorders);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        setAuthStatus(data.authenticated ? "authenticated" : "unauthenticated");
        setLoading(data.authenticated);
      } catch (error) {
        console.error("Error checking admin session:", error);
        setAuthStatus("unauthenticated");
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  useEffect(() => {
    if (slug && authStatus === "authenticated") {
      setLoading(true);
      fetchData();
    }
  }, [slug, authStatus]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          data.error === "Admin login is not configured."
            ? "Admin login is not configured on this server. On Render, add ADMIN_PASSWORD and ADMIN_SESSION_SECRET in Environment, then save, rebuild, and deploy."
            : data.error || "Login failed.";
        throw new Error(message);
      }

      setAdminPassword("");
      setAuthStatus("authenticated");
    } catch (error: any) {
      setLoginError(error.message || "Login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setRestaurant(null);
      setMenu([]);
      setAuthStatus("unauthenticated");
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const resRest = await fetch(`/api/restaurant/${slug}`);
      if (resRest.status === 401) {
        setAuthStatus("unauthenticated");
        return;
      }
      if (!resRest.ok) throw new Error("Failed to load restaurant");
      const rest = await resRest.json();
      setRestaurant(rest);
      setEditRestaurantName(rest.name);
      setBackgroundUrl(rest.background_url || "");
      setLogoUrl(rest.logo_url || "");
      setPhone(rest.phone || "");
      setAddress(rest.address || "");
      setWifiPassword(rest.wifi_password || "");
      setOpeningHours(rest.opening_hours || "");
      setFacebookUrl(rest.facebook_url || "");
      setInstagramUrl(rest.instagram_url || "");

      const resMenu = await fetch(`/api/menu/${rest.id}`);
      if (resMenu.status === 401) {
        setAuthStatus("unauthenticated");
        return;
      }
      if (!resMenu.ok) throw new Error("Failed to load menu");
      const menuData = await resMenu.json();
      setMenu(menuData);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim() || !restaurant) return;

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          name: newCategoryName.trim(),
          parent_id: null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add category");
      }

      const newCat = await res.json();
      setMenu([...menu, newCat]);
      setNewCategoryName("");
    } catch (error: any) {
      console.error("Error adding category:", error);
      alert("Error adding category: " + error.message);
    }
  };

  const addSubcategory = async (parentId: number, name: string) => {
    if (!restaurant || !name.trim()) return;
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          name: name.trim(),
          parent_id: parentId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add subcategory");
      }

      const newSub = await res.json();
      setMenu(
        menu.map((cat) =>
          cat.id === parentId
            ? { ...cat, subcategories: [...(cat.subcategories || []), newSub] }
            : cat,
        ),
      );
    } catch (error: any) {
      console.error("Error adding subcategory:", error);
      alert("Error adding subcategory: " + error.message);
    }
  };

  const deleteCategory = async (id: number, parentId: number | null = null) => {
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete category");

      if (parentId) {
        setMenu(
          menu.map((cat) =>
            cat.id === parentId
              ? {
                  ...cat,
                  subcategories: cat.subcategories?.filter((s) => s.id !== id),
                }
              : cat,
          ),
        );
      } else {
        setMenu(menu.filter((c) => c.id !== id));
      }
    } catch (error: any) {
      console.error("Error deleting category:", error);
      alert("Error deleting category: " + error.message);
    }
  };

  const updateCategory = async (
    id: number,
    data: { name: string; image_url?: string },
    parentId: number | null = null,
  ) => {
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Failed to update category");

      const updated = await res.json();
      if (parentId) {
        setMenu(
          menu.map((cat) =>
            cat.id === parentId
              ? {
                  ...cat,
                  subcategories: cat.subcategories?.map((s) =>
                    s.id === id ? { ...s, ...updated } : s,
                  ),
                }
              : cat,
          ),
        );
      } else {
        setMenu(menu.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      }
    } catch (error: any) {
      console.error("Error updating category:", error);
      alert("Error updating category: " + error.message);
    }
  };

  const addProduct = async (
    categoryId: number,
    product: any,
    parentId: number | null = null,
  ) => {
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId, ...product }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add product");
      }

      const newProd = await res.json();

      if (parentId) {
        setMenu(
          menu.map((cat) =>
            cat.id === parentId
              ? {
                  ...cat,
                  subcategories: cat.subcategories?.map((s) =>
                    s.id === categoryId
                      ? { ...s, products: [...s.products, newProd] }
                      : s,
                  ),
                }
              : cat,
          ),
        );
      } else {
        setMenu(
          menu.map((cat) =>
            cat.id === categoryId
              ? { ...cat, products: [...cat.products, newProd] }
              : cat,
          ),
        );
      }
    } catch (error: any) {
      console.error("Error adding product:", error);
      alert("Error adding product: " + error.message);
    }
  };

  const updateProduct = async (
    productId: number,
    categoryId: number,
    product: any,
    parentId: number | null = null,
  ) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product),
      });

      if (!res.ok) throw new Error("Failed to update product");

      const updatedProd = await res.json();

      if (parentId) {
        setMenu(
          menu.map((cat) =>
            cat.id === parentId
              ? {
                  ...cat,
                  subcategories: cat.subcategories?.map((s) =>
                    s.id === categoryId
                      ? {
                          ...s,
                          products: s.products.map((p) =>
                            p.id === productId ? { ...p, ...updatedProd } : p,
                          ),
                        }
                      : s,
                  ),
                }
              : cat,
          ),
        );
      } else {
        setMenu(
          menu.map((cat) =>
            cat.id === categoryId
              ? {
                  ...cat,
                  products: cat.products.map((p) =>
                    p.id === productId ? { ...p, ...updatedProd } : p,
                  ),
                }
              : cat,
          ),
        );
      }
    } catch (error: any) {
      console.error("Error updating product:", error);
      alert("Error updating product: " + error.message);
    }
  };

  const deleteProduct = async (
    productId: number,
    categoryId: number,
    parentId: number | null = null,
  ) => {
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete product");

      if (parentId) {
        setMenu(
          menu.map((cat) =>
            cat.id === parentId
              ? {
                  ...cat,
                  subcategories: cat.subcategories?.map((s) =>
                    s.id === categoryId
                      ? {
                          ...s,
                          products: s.products.filter(
                            (p) => p.id !== productId,
                          ),
                        }
                      : s,
                  ),
                }
              : cat,
          ),
        );
      } else {
        setMenu(
          menu.map((cat) =>
            cat.id === categoryId
              ? {
                  ...cat,
                  products: cat.products.filter((p) => p.id !== productId),
                }
              : cat,
          ),
        );
      }
    } catch (error: any) {
      console.error("Error deleting product:", error);
      alert("Error deleting product: " + error.message);
    }
  };

  const moveCategory = async (
    idx: number,
    direction: "up" | "down",
    parentId: number | null = null,
  ) => {
    const targetMenu = parentId
      ? menu.find((c) => c.id === parentId)?.subcategories || []
      : menu;

    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= targetMenu.length) return;

    const newOrder = [...targetMenu];
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(newIdx, 0, moved);

    if (parentId) {
      setMenu(
        menu.map((cat) =>
          cat.id === parentId ? { ...cat, subcategories: newOrder } : cat,
        ),
      );
    } else {
      setMenu(newOrder);
    }

    debouncedReorder(
      "categories",
      newOrder.map((c) => c.id),
    );
  };

  const reorderSubcategories = async (
    parentId: number,
    newOrder: Category[],
  ) => {
    setMenu(
      menu.map((cat) =>
        cat.id === parentId ? { ...cat, subcategories: newOrder } : cat,
      ),
    );

    debouncedReorder(
      "categories",
      newOrder.map((c) => c.id),
    );
  };

  const moveProduct = async (
    categoryId: number,
    productId: number,
    direction: "up" | "down",
    parentId: number | null = null,
  ) => {
    const parentCat = parentId ? menu.find((c) => c.id === parentId) : null;
    const category = parentId
      ? parentCat?.subcategories?.find((s) => s.id === categoryId)
      : menu.find((c) => c.id === categoryId);

    if (!category) return;

    const idx = category.products.findIndex((p) => p.id === productId);
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= category.products.length) return;

    const newProducts = [...category.products];
    const [moved] = newProducts.splice(idx, 1);
    newProducts.splice(newIdx, 0, moved);

    if (parentId) {
      setMenu(
        menu.map((cat) =>
          cat.id === parentId
            ? {
                ...cat,
                subcategories: cat.subcategories?.map((s) =>
                  s.id === categoryId ? { ...s, products: newProducts } : s,
                ),
              }
            : cat,
        ),
      );
    } else {
      setMenu(
        menu.map((c) =>
          c.id === categoryId ? { ...c, products: newProducts } : c,
        ),
      );
    }

    debouncedReorder(
      "products",
      newProducts.map((p) => p.id),
    );
  };

  const updateRestaurantInfo = async () => {
    if (!restaurant || !editRestaurantName.trim()) return;
    try {
      const res = await fetch(`/api/restaurant/${restaurant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editRestaurantName,
          background_url: backgroundUrl,
          logo_url: logoUrl,
          phone,
          address,
          wifi_password: wifiPassword,
          opening_hours: openingHours,
          facebook_url: facebookUrl,
          instagram_url: instagramUrl,
        }),
      });

      if (!res.ok) throw new Error("Failed to update restaurant info");

      const data = await res.json();
      console.log("Update success response:", data);

      setRestaurant({
        ...restaurant,
        name: editRestaurantName,
        background_url: backgroundUrl,
        logo_url: logoUrl,
        phone,
        address,
        wifi_password: wifiPassword,
        opening_hours: openingHours,
        facebook_url: facebookUrl,
        instagram_url: instagramUrl,
      });
      setIsEditingRestaurant(false);
      alert("Restaurant info updated successfully!");
    } catch (error: any) {
      console.error("Error updating restaurant info:", error);
      alert("Error updating restaurant info: " + error.message);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBackgroundUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (authStatus === "checking" || loading)
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );

  if (authStatus === "unauthenticated")
    return (
      <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex items-center justify-center p-6">
        <form
          onSubmit={login}
          className="w-full max-w-sm bg-white border border-stone-200 rounded-2xl shadow-xl p-8 space-y-5"
        >
          <div className="w-12 h-12 rounded-full bg-stone-900 text-stone-50 flex items-center justify-center">
            <Lock size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-serif">Admin Login</h1>
            <p className="text-sm text-stone-500 mt-1">
              Enter the owner password to edit this menu.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              Password
            </label>
            <div className="relative">
              <input
                type={showAdminPassword ? "text" : "password"}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-stone-400"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-900 p-1 transition-colors"
                title={showAdminPassword ? "Hide password" : "Show password"}
                aria-label={showAdminPassword ? "Hide password" : "Show password"}
              >
                {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {loginError && (
            <p className="text-sm text-red-500" role="alert">
              {loginError}
            </p>
          )}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-stone-900 text-stone-50 px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-stone-800 disabled:opacity-60 transition-colors"
          >
            {isLoggingIn ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    );

  if (!restaurant) return <div>Restaurant not found</div>;

  const menuUrl = `${window.location.origin}/${restaurant.slug}`;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-4">
          <div>
            {isEditingRestaurant ? (
              <div className="space-y-4 mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="text-3xl font-serif bg-white border border-stone-200 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-stone-400"
                    value={editRestaurantName}
                    onChange={(e) => setEditRestaurantName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateRestaurantInfo();
                      if (e.key === "Escape") {
                        setEditRestaurantName(restaurant.name);
                        setBackgroundUrl(restaurant.background_url || "");
                        setLogoUrl(restaurant.logo_url || "");
                        setPhone(restaurant.phone || "");
                        setAddress(restaurant.address || "");
                        setWifiPassword(restaurant.wifi_password || "");
                        setOpeningHours(restaurant.opening_hours || "");
                        setFacebookUrl(restaurant.facebook_url || "");
                        setInstagramUrl(restaurant.instagram_url || "");
                        setIsEditingRestaurant(false);
                      }
                    }}
                  />
                  <button
                    onClick={updateRestaurantInfo}
                    className="bg-stone-900 text-stone-50 px-4 py-2 rounded-lg hover:bg-stone-800 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditRestaurantName(restaurant.name);
                      setBackgroundUrl(restaurant.background_url || "");
                      setLogoUrl(restaurant.logo_url || "");
                      setPhone(restaurant.phone || "");
                      setAddress(restaurant.address || "");
                      setWifiPassword(restaurant.wifi_password || "");
                      setOpeningHours(restaurant.opening_hours || "");
                      setFacebookUrl(restaurant.facebook_url || "");
                      setInstagramUrl(restaurant.instagram_url || "");
                      setIsEditingRestaurant(false);
                    }}
                    className="text-stone-400 hover:text-stone-600 p-2"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                      Phone
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                      Address
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                      WiFi Password
                    </label>
                    <input
                      type="text"
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400"
                      value={wifiPassword}
                      onChange={(e) => setWifiPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 mt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase flex items-center gap-1">
                      🕐 Opening Hours
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mon–Fri 09:00–22:00, Sat–Sun 10:00–23:00"
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400"
                      value={openingHours}
                      onChange={(e) => setOpeningHours(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase flex items-center gap-1">
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="#1877F2"
                      >
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Facebook URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://facebook.com/yourpage"
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400"
                      value={facebookUrl}
                      onChange={(e) => setFacebookUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase flex items-center gap-1">
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        fill="url(#ig-grad)"
                      >
                        <defs>
                          <linearGradient
                            id="ig-grad"
                            x1="0%"
                            y1="100%"
                            x2="100%"
                            y2="0%"
                          >
                            <stop offset="0%" stopColor="#f09433" />
                            <stop offset="25%" stopColor="#e6683c" />
                            <stop offset="50%" stopColor="#dc2743" />
                            <stop offset="75%" stopColor="#cc2366" />
                            <stop offset="100%" stopColor="#bc1888" />
                          </linearGradient>
                        </defs>
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                      Instagram URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://instagram.com/yourpage"
                      className="w-full bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400"
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">
                      Logo
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="relative group overflow-hidden bg-stone-100 rounded-xl border-2 border-dashed border-stone-200 w-32 h-20 flex items-center justify-center">
                        {logoUrl ? (
                          <>
                            <img
                              src={logoUrl}
                              alt="Logo Preview"
                              className="w-full h-full object-contain"
                            />
                            <button
                              onClick={() => setLogoUrl("")}
                              className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <ImageIcon className="text-stone-300" size={24} />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={handleLogoUpload}
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Or enter image URL..."
                          className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-400"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                        />
                        <p className="text-[10px] text-stone-400 mt-1 italic">
                          Shown in the hero banner and footer.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">
                      Hero Background Image
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="relative group overflow-hidden bg-stone-100 rounded-xl border-2 border-dashed border-stone-200 w-32 h-20 flex items-center justify-center">
                        {backgroundUrl ? (
                          <>
                            <img
                              src={backgroundUrl}
                              alt="Background Preview"
                              className="w-full h-full object-cover"
                            />
                            <button
                              onClick={() => setBackgroundUrl("")}
                              className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <ImageIcon className="text-stone-300" size={24} />
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={handleBackgroundUpload}
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Or enter image URL..."
                          className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-400"
                          value={backgroundUrl}
                          onChange={(e) => setBackgroundUrl(e.target.value)}
                        />
                        <p className="text-[10px] text-stone-400 mt-1 italic">
                          Shown only in the hero banner at the top of the menu.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 mb-2 group">
                <h1 className="text-4xl font-serif">{restaurant.name}</h1>
                <button
                  onClick={() => setIsEditingRestaurant(true)}
                  className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-900 transition-all p-1"
                  title="Edit Restaurant Info"
                >
                  <Pencil size={18} />
                </button>
              </div>
            )}
            <p className="text-stone-500 uppercase tracking-widest text-xs">
              Admin Dashboard
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={logout}
              className="flex items-center gap-2 border border-stone-300 px-4 py-2 rounded-full text-sm hover:bg-stone-100 transition-colors"
            >
              <LogOut size={16} />
              Logout
            </button>
            <button
              onClick={() => setShowQR(!showQR)}
              className="flex items-center gap-2 bg-stone-900 text-stone-50 px-4 py-2 rounded-full text-sm hover:bg-stone-800 transition-colors"
            >
              <QrCode size={16} />
              QR Code
            </button>
            <Link
              to={`/${restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-stone-300 px-4 py-2 rounded-full text-sm hover:bg-stone-100 transition-colors"
            >
              <ExternalLink size={16} />
              View Menu
            </Link>
          </div>
        </header>

        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-3xl shadow-xl mb-12 flex flex-col items-center border border-stone-200"
            >
              <QRCodeSVG value={menuUrl} size={200} />
              <p className="mt-4 text-stone-500 text-sm font-mono">{menuUrl}</p>
              <p className="mt-2 text-stone-400 text-xs">
                Print this QR code for your tables
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <section className="space-y-8">
          <div className="flex items-center gap-4 mb-8">
            <input
              type="text"
              placeholder="New Category (e.g. Starters)"
              className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-stone-400"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addCategory()}
            />
            <button
              onClick={() => addCategory()}
              className="bg-stone-900 text-stone-50 p-3 rounded-xl hover:bg-stone-800 transition-colors"
            >
              <Plus size={24} />
            </button>
          </div>

          <Reorder.Group
            axis="y"
            values={menu}
            onReorder={(newOrder) => {
              setMenu(newOrder);
              debouncedReorder(
                "categories",
                newOrder.map((c) => c.id),
              );
            }}
            className="space-y-8"
          >
            {menu.map((category, idx) => (
              <Reorder.Item key={category.id} value={category}>
                <CategorySection
                  category={category}
                  index={idx}
                  onDelete={deleteCategory}
                  onUpdateCategory={updateCategory}
                  onAddProduct={addProduct}
                  onUpdateProduct={updateProduct}
                  onDeleteProduct={deleteProduct}
                  onMoveProduct={moveProduct}
                  onMoveCategory={moveCategory}
                  onAddSubcategory={addSubcategory}
                  onReorderSubcategories={reorderSubcategories}
                  onBulkImport={async (cid, prods) => {
                    if (!restaurant) {
                      throw new Error(
                        "Restaurant data is not loaded. Please refresh the page.",
                      );
                    }
                    try {
                      const extractErrorMessage = (raw: string) => {
                        if (!raw) return "";
                        try {
                          const parsed = JSON.parse(raw);
                          const err =
                            (parsed as any)?.error || (parsed as any)?.message;
                          return typeof err === "string" && err.trim()
                            ? err
                            : raw;
                        } catch {
                          return raw;
                        }
                      };

                      console.log(
                        `Starting bulk import for category ${cid}...`,
                      );
                      const res = await fetch(
                        `/api/categories/${cid}/products/bulk`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ products: prods }),
                        },
                      );
                      console.log(
                        "Bulk import response:",
                        res.status,
                        res.statusText,
                      );

                      if (res.ok) {
                        const menuRes = await fetch(
                          `/api/menu/${restaurant.id}`,
                        );
                        console.log(
                          "Menu refresh response:",
                          menuRes.status,
                          menuRes.statusText,
                        );
                        const menuRaw = await menuRes.text();
                        if (!menuRes.ok) {
                          const msg = extractErrorMessage(menuRaw);
                          throw new Error(
                            msg ||
                              `Failed to refresh menu (HTTP ${menuRes.status}).`,
                          );
                        }
                        let data: any;
                        try {
                          data = JSON.parse(menuRaw);
                        } catch {
                          throw new Error(
                            `Menu refresh returned non-JSON (HTTP ${menuRes.status}). If you're on port 5173, start the app via the Express server (port 3000).`,
                          );
                        }
                        setMenu(data);
                      } else {
                        const raw = await res.text();
                        const msg = extractErrorMessage(raw);
                        throw new Error(
                          msg ||
                            `Failed to import products (HTTP ${res.status}).`,
                        );
                      }
                    } catch (err: any) {
                      console.error("Bulk import fetch error:", err);
                      throw err;
                    }
                  }}
                  isExpanded={expandedCategoryId === category.id}
                  onToggle={() =>
                    setExpandedCategoryId(
                      expandedCategoryId === category.id ? null : category.id,
                    )
                  }
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        </section>
      </div>
    </div>
  );
}
