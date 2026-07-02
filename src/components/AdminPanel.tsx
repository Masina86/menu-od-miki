import React, { useState, useEffect, useMemo, useRef } from "react";
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
  Star,
  Wand2,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { Restaurant, Category, Product, LogoFit } from "../types";
import { ImageModal } from "./ImageModal";
import { AllergenPicker } from "./AllergenIcons";
import { ApiError, apiRequest, jsonRequest } from "../utils/api";
import { ImageCropper } from "./ImageCropper";

type NoticeType = "info" | "success" | "error";

interface Notice {
  type: NoticeType;
  message: string;
}

interface PopularCategoryStats {
  enabled: boolean;
  current_period_key: string;
  popular_period_key: string;
  cutoff_hour: number;
  time_zone: string;
  active_category: Pick<Category, "id" | "name" | "name_en" | "name_bg"> | null;
  current_leader:
    | (Pick<Category, "id" | "name" | "name_en" | "name_bg"> & {
        views: number;
      })
    | null;
  previous_winner:
    | (Pick<Category, "id" | "name" | "name_en" | "name_bg"> & {
        views: number;
      })
    | null;
  current_period_views: number;
}

type ProductFormData = Omit<Product, "id" | "category_id" | "sort_order">;

interface TransparentPreviewResponse {
  image_url: string;
}

interface TransparentDialogState {
  title: string;
  originalUrl: string;
  resultUrl: string;
  applyLabel: string;
  onApply: (imageUrl: string) => Promise<void> | void;
}

const ACCEPTED_IMAGE_FORMATS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".bmp",
  ".ico",
  ".tif",
  ".tiff",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/tiff",
].join(",");

const DEFAULT_LOGO_SIZE = 100;
const MIN_LOGO_SIZE = 60;
const MAX_LOGO_SIZE = 180;
const DEFAULT_LOGO_POSITION = 50;

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

const normalizeLogoFit = (value: unknown): LogoFit =>
  value === "cover" ? "cover" : "contain";

const isValidOptionalUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:image/")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const isDataImageUrl = (value: string) =>
  value.trim().startsWith("data:image/");

const noticeClasses: Record<NoticeType, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-green-200 bg-green-50 text-green-700",
  error: "border-red-200 bg-red-50 text-red-600",
};

const InlineNotice: React.FC<{ notice: Notice | null; className?: string }> = ({
  notice,
  className = "",
}) => {
  if (!notice) return null;
  return (
    <div
      role={notice.type === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${noticeClasses[notice.type]} ${className}`}
    >
      {notice.message}
    </div>
  );
};

interface AdminLoginViewProps {
  password: string;
  showPassword: boolean;
  error: string;
  isLoggingIn: boolean;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (event: React.FormEvent) => void;
}

const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  password,
  showPassword,
  error,
  isLoggingIn,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
}) => (
  <div className="min-h-screen bg-stone-50 text-stone-900 font-sans flex items-center justify-center p-6">
    <form
      onSubmit={onSubmit}
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
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:ring-2 focus:ring-stone-400"
            autoFocus
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center text-stone-400 hover:text-stone-900 transition-colors"
            title={showPassword ? "Hide password" : "Show password"}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
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

const checkerboardStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(45deg, #d6d3d1 25%, transparent 25%), linear-gradient(-45deg, #d6d3d1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d6d3d1 75%), linear-gradient(-45deg, transparent 75%, #d6d3d1 75%)",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
  backgroundSize: "16px 16px",
};

const TransparentImageButton: React.FC<{
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
}> = ({ onClick, disabled, className = "" }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title="Make image transparent"
    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white/90 text-stone-500 shadow-sm transition-colors hover:bg-white hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
  >
    {disabled ? (
      <Loader2 size={15} className="animate-spin" />
    ) : (
      <Wand2 size={15} />
    )}
  </button>
);

const TransparentPreviewDialog: React.FC<{
  dialog: TransparentDialogState;
  isApplying: boolean;
  onApply: () => void;
  onCancel: () => void;
}> = ({ dialog, isApplying, onApply, onCancel }) => (
  <div
    className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4"
    onClick={(e) => e.target === e.currentTarget && !isApplying && onCancel()}
  >
    <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
        <h3 className="text-base font-bold text-stone-800">{dialog.title}</h3>
        <button
          type="button"
          onClick={onCancel}
          disabled={isApplying}
          className="rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-800 disabled:opacity-50"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>
      <div className="grid gap-4 overflow-auto p-5 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
            Original
          </p>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-stone-50">
            <img
              src={dialog.originalUrl}
              alt="Original"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
            Transparent
          </p>
          <div
            className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-stone-200"
            style={checkerboardStyle}
          >
            <img
              src={dialog.resultUrl}
              alt="Transparent preview"
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-stone-100 px-5 py-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isApplying}
          className="rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-200 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={isApplying}
          className="min-w-28 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
        >
          {isApplying ? "Applying..." : dialog.applyLabel}
        </button>
      </div>
    </div>
  </div>
);

interface CategorySectionProps {
  category: Category;
  parentId?: number | null;
  index: number;
  onDelete: (id: number, parentId?: number | null) => void;
  onUpdateCategory: (
    id: number,
    data: any,
    parentId?: number | null,
  ) => Promise<void>;
  onUpdateCategoryImage: (
    id: number,
    imageUrl: string,
    parentId?: number | null,
  ) => Promise<void>;
  onAddProduct: (
    categoryId: number,
    p: ProductFormData,
    parentId?: number | null,
  ) => Promise<void>;
  onUpdateProduct: (
    productId: number,
    categoryId: number,
    p: ProductFormData,
    parentId?: number | null,
  ) => Promise<void>;
  onUpdateProductImage: (
    productId: number,
    categoryId: number,
    imageUrl: string,
    parentId?: number | null,
  ) => Promise<void>;
  onDeleteProduct: (
    productId: number,
    categoryId: number,
    parentId?: number | null,
  ) => Promise<void>;
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
  onAddSubcategory: (parentId: number, name: string) => Promise<void>;
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
  onUpdateCategoryImage,
  onAddProduct,
  onUpdateProduct,
  onUpdateProductImage,
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
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [formNotice, setFormNotice] = useState<Notice | null>(null);
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
  const [transparentDialog, setTransparentDialog] =
    useState<TransparentDialogState | null>(null);
  const [transparentAction, setTransparentAction] = useState<string | null>(
    null,
  );
  const [isApplyingTransparent, setIsApplyingTransparent] = useState(false);

  const openTransparentPreview = async (
    actionKey: string,
    options: {
      title: string;
      originalUrl: string;
      payload: Record<string, unknown>;
      applyLabel: string;
      onApply: (imageUrl: string) => Promise<void> | void;
    },
  ) => {
    if (!options.originalUrl) return;
    setTransparentAction(actionKey);
    setFormNotice({
      type: "info",
      message: "Preparing transparent preview...",
    });
    try {
      const preview = await jsonRequest<TransparentPreviewResponse>(
        "/api/images/transparent-preview",
        "POST",
        options.payload,
      );
      setTransparentDialog({
        title: options.title,
        originalUrl: options.originalUrl,
        resultUrl: preview.image_url,
        applyLabel: options.applyLabel,
        onApply: options.onApply,
      });
      setFormNotice(null);
    } catch (error: any) {
      setFormNotice({
        type: "error",
        message: error?.message || "Could not make this image transparent.",
      });
    } finally {
      setTransparentAction(null);
    }
  };

  const applyTransparentPreview = async () => {
    if (!transparentDialog) return;
    setIsApplyingTransparent(true);
    try {
      await transparentDialog.onApply(transparentDialog.resultUrl);
      setTransparentDialog(null);
      setFormNotice({ type: "success", message: "Transparent image applied." });
    } catch (error: any) {
      setFormNotice({
        type: "error",
        message: error?.message || "Could not apply transparent image.",
      });
    } finally {
      setIsApplyingTransparent(false);
    }
  };

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

  const handleSave = async () => {
    const price = Number.parseFloat(newProd.price);
    if (!newProd.name.trim()) {
      setFormNotice({ type: "error", message: "Product name is required." });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setFormNotice({
        type: "error",
        message: "Product price must be a valid number.",
      });
      return;
    }
    if (newProd.image_url && !isValidOptionalUrl(newProd.image_url)) {
      setFormNotice({
        type: "error",
        message: "Product image must be a valid URL or uploaded image.",
      });
      return;
    }

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
      name: newProd.name.trim(),
      name_en: newProd.name_en,
      name_bg: newProd.name_bg,
      price,
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

    setIsSavingProduct(true);
    setFormNotice({
      type: "info",
      message: editingProduct ? "Updating product..." : "Adding product...",
    });
    try {
      if (editingProduct) {
        await onUpdateProduct(
          editingProduct.id,
          category.id,
          productData,
          parentId,
        );
      } else {
        await onAddProduct(category.id, productData, parentId);
      }
      setFormNotice({
        type: "success",
        message: editingProduct ? "Product updated." : "Product added.",
      });
      resetForm();
    } catch (error: any) {
      setFormNotice({
        type: "error",
        message: error?.message || "Could not save product.",
      });
    } finally {
      setIsSavingProduct(false);
    }
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
    setFormNotice(null);
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
    if (!categoryEditData.name.trim()) {
      setFormNotice({ type: "error", message: "Category name is required." });
      return;
    }
    if (
      categoryEditData.image_url &&
      !isValidOptionalUrl(categoryEditData.image_url)
    ) {
      setFormNotice({
        type: "error",
        message: "Category image must be a valid URL or uploaded image.",
      });
      return;
    }

    setIsSavingCategory(true);
    setFormNotice({ type: "info", message: "Saving category..." });
    try {
      await onUpdateCategory(
        category.id,
        { ...categoryEditData, name: categoryEditData.name.trim() },
        parentId,
      );
      setIsEditingCategory(false);
      setFormNotice({ type: "success", message: "Category updated." });
    } catch (error: any) {
      setFormNotice({
        type: "error",
        message: error?.message || "Could not update category.",
      });
    } finally {
      setIsSavingCategory(false);
    }
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
        const result = event.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          setImportStatus({
            type: "error",
            message: "Failed to read the file.",
          });
          return;
        }

        const bytes = new Uint8Array(result);
        let text = "";
        if (bytes[0] === 0xff && bytes[1] === 0xfe) {
          text = new TextDecoder("utf-16le").decode(bytes.subarray(2));
        } else if (
          bytes[0] === 0xef &&
          bytes[1] === 0xbb &&
          bytes[2] === 0xbf
        ) {
          text = new TextDecoder("utf-8").decode(bytes.subarray(3));
        } else {
          text = new TextDecoder("utf-8").decode(bytes);
        }

        if (!text) {
          setImportStatus({ type: "error", message: "File is empty." });
          return;
        }

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
          const tabCount = (firstLine.match(/\t/g) || []).length;
          const commaCount = (firstLine.match(/,/g) || []).length;
          const semicolonCount = (firstLine.match(/;/g) || []).length;
          delimiter =
            tabCount >= semicolonCount && tabCount >= commaCount
              ? "\t"
              : semicolonCount > commaCount
                ? ";"
                : ",";
        }

        const headers = lines[firstLineIdx]
          .split(delimiter)
          .map((h) => h.trim().toLowerCase());
        const findColIdx = (key: string) => {
          const map: Record<string, string[]> = {
            title: [
              "title",
              "наслов",
              "име",
              "name",
              "производ",
              "назив",
              "product",
            ],
            title_en: ["title_en", "name_en"],
            title_bg: ["title_bg", "name_bg"],
            description: ["description", "опис", "детали", "инфо"],
            description_en: ["description_en", "desc_en"],
            description_bg: ["description_bg", "desc_bg"],
            price: ["price", "цена", "износ", "price_mdn"],
            image: ["image", "слика", "image_url", "фото", "url"],
            additions: ["additions", "додатоци", "додаток", "extra"],
          };
          const matches = map[key] || [key];
          return headers.findIndex((h) => matches.includes(h));
        };

        const idx = {
          title: findColIdx("title"),
          title_en: findColIdx("title_en"),
          title_bg: findColIdx("title_bg"),
          desc: findColIdx("description"),
          desc_en: findColIdx("description_en"),
          desc_bg: findColIdx("description_bg"),
          price: findColIdx("price"),
          img: findColIdx("image"),
          adds: findColIdx("additions"),
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

            const priceStr = getV(idx.price).replace(/[^0-9.]/g, "");
            const additionsStr = getV(idx.adds);
            const additions = additionsStr
              ? additionsStr
                  .split(";")
                  .map((a) => {
                    const parts = a.split(":");
                    const rawNames = (parts[0] || "").trim();
                    const nameParts = rawNames.split("|").map((s) => s.trim());
                    const name = (nameParts[0] || "").trim();
                    const name_en = (nameParts[1] || "").trim();
                    const name_bg = (nameParts[2] || "").trim();

                    return {
                      name,
                      name_en,
                      name_bg,
                      price: parts[1]
                        ? parseFloat(parts[1].replace(/[^0-9.]/g, ""))
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
              additions: additions,
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
    reader.readAsArrayBuffer(file);
  };

  const handleCsvExport = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Build filename from category name directly — no need to parse server headers
    const safeName = (category.name || "products").replace(
      /[\\/:*?"<>|]+/g,
      "-",
    );
    const filename = `${safeName}.tsv`;

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

  const handleSaveSubcategory = async () => {
    if (!newSubcategoryName.trim()) {
      setFormNotice({
        type: "error",
        message: "Subcategory name is required.",
      });
      return;
    }
    setFormNotice({ type: "info", message: "Adding subcategory..." });
    try {
      await onAddSubcategory(category.id, newSubcategoryName.trim());
      setNewSubcategoryName("");
      setIsAddingSubcategory(false);
      setFormNotice({ type: "success", message: "Subcategory added." });
    } catch (error: any) {
      setFormNotice({
        type: "error",
        message: error?.message || "Could not add subcategory.",
      });
    }
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
              <div className="relative">
                <img
                  src={category.image_url}
                  alt=""
                  className="h-8 w-8 rounded-full border border-stone-200 object-cover"
                />
                <TransparentImageButton
                  disabled={transparentAction === `category-${category.id}`}
                  className="absolute -right-3 -top-3 h-6 w-6 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openTransparentPreview(`category-${category.id}`, {
                      title: `Make ${category.name} transparent`,
                      originalUrl: category.image_url || "",
                      payload: { type: "category", id: category.id },
                      applyLabel: "Apply",
                      onApply: (imageUrl) =>
                        onUpdateCategoryImage(category.id, imageUrl, parentId),
                    });
                  }}
                />
              </div>
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
              title="Import Products (CSV/TSV)"
            >
              {isImporting ? <Loader2 size={18} /> : <FileUp size={18} />}
            </button>
            <input
              type="file"
              accept=".csv,.CSV,.tsv,.TSV,text/csv,text/tab-separated-values"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={handleCsvImport}
            />
          </div>
          <button
            onClick={handleCsvExport}
            className="text-stone-400 hover:text-stone-900 transition-colors p-2"
            title="Export Products (Excel TSV)"
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
            <InlineNotice notice={formNotice} />
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
                  accept={ACCEPTED_IMAGE_FORMATS}
                  onChange={handleCategoryImageUpload}
                  className="text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"
                />
                {categoryEditData.image_url && (
                  <div className="relative">
                    <img
                      src={categoryEditData.image_url}
                      alt="Preview"
                      className="h-10 w-10 rounded-full border border-stone-200 object-cover"
                    />
                    <TransparentImageButton
                      disabled={
                        transparentAction === `category-form-${category.id}`
                      }
                      className="absolute -right-3 -top-3 h-6 w-6 rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        void openTransparentPreview(
                          `category-form-${category.id}`,
                          {
                            title: "Make category image transparent",
                            originalUrl: categoryEditData.image_url,
                            payload: { image_url: categoryEditData.image_url },
                            applyLabel: "Use preview",
                            onApply: (imageUrl) =>
                              setCategoryEditData({
                                ...categoryEditData,
                                image_url: imageUrl,
                              }),
                          },
                        );
                      }}
                    />
                  </div>
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
                disabled={isSavingCategory}
                className="bg-stone-900 text-stone-50 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-800 disabled:opacity-60 transition-colors shadow-sm"
              >
                {isSavingCategory ? "Saving..." : "Save Changes"}
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
                  onClick={async () => {
                    setIsDeletingCategory(true);
                    try {
                      await onDelete(category.id, parentId);
                      setShowDeleteConfirm(false);
                    } catch {
                      // Parent handler shows the visible error notice.
                    } finally {
                      setIsDeletingCategory(false);
                    }
                  }}
                  disabled={isDeletingCategory}
                  className="flex-1 bg-red-500 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-600 disabled:opacity-60 transition-colors shadow-sm"
                >
                  {isDeletingCategory ? "Deleting..." : "Delete"}
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
                            onUpdateCategoryImage={onUpdateCategoryImage}
                            onAddProduct={onAddProduct}
                            onUpdateProduct={onUpdateProduct}
                            onUpdateProductImage={onUpdateProductImage}
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
                      <div className="space-y-1 col-span-full">
                        <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase">
                          Allergens
                        </label>
                        <AllergenPicker
                          value={newProd.allergens}
                          onChange={(val) =>
                            setNewProd({ ...newProd, allergens: val })
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
                        accept={ACCEPTED_IMAGE_FORMATS}
                        onChange={handleImageUpload}
                        className="text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-stone-100 file:text-stone-700 hover:file:bg-stone-200"
                      />
                      {newProd.image_url && (
                        <div className="relative">
                          <img
                            src={newProd.image_url}
                            alt="Preview"
                            className="h-12 w-12 rounded-lg border border-stone-200 object-cover"
                          />
                          <TransparentImageButton
                            disabled={transparentAction === "product-form"}
                            className="absolute -right-3 -top-3 h-6 w-6 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openTransparentPreview("product-form", {
                                title: "Make product image transparent",
                                originalUrl: newProd.image_url,
                                payload: { image_url: newProd.image_url },
                                applyLabel: "Use preview",
                                onApply: (imageUrl) =>
                                  setNewProd({
                                    ...newProd,
                                    image_url: imageUrl,
                                  }),
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-stone-200/50">
                    <InlineNotice notice={formNotice} className="mr-auto" />
                    <button
                      onClick={resetForm}
                      disabled={isSavingProduct}
                      className="px-4 py-2 text-xs text-stone-400 uppercase tracking-widest font-bold hover:text-stone-600 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSavingProduct}
                      className="bg-stone-900 text-stone-50 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-800 disabled:opacity-60 transition-colors shadow-sm"
                    >
                      {isSavingProduct
                        ? "Saving..."
                        : editingProduct
                          ? "Update Product"
                          : "Add Product"}
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
                        <TransparentImageButton
                          disabled={
                            transparentAction === `product-${product.id}`
                          }
                          className="absolute -right-2 -top-2 h-7 w-7 rounded-full opacity-0 group-hover/img:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void openTransparentPreview(
                              `product-${product.id}`,
                              {
                                title: `Make ${product.name} transparent`,
                                originalUrl: product.image_url || "",
                                payload: { type: "product", id: product.id },
                                applyLabel: "Apply",
                                onApply: (imageUrl) =>
                                  onUpdateProductImage(
                                    product.id,
                                    category.id,
                                    imageUrl,
                                    parentId,
                                  ),
                              },
                            );
                          }}
                        />
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
                          void onUpdateProduct(
                            product.id,
                            category.id,
                            {
                              ...product,
                              is_available: product.is_available === 0 ? 1 : 0,
                            },
                            parentId,
                          ).catch((error) =>
                            setFormNotice({
                              type: "error",
                              message:
                                error?.message ||
                                "Could not update product availability.",
                            }),
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
                        onClick={() => {
                          void onDeleteProduct(
                            product.id,
                            category.id,
                            parentId,
                          ).catch((error) =>
                            setFormNotice({
                              type: "error",
                              message:
                                error?.message || "Could not delete product.",
                            }),
                          );
                        }}
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
      {transparentDialog && (
        <TransparentPreviewDialog
          dialog={transparentDialog}
          isApplying={isApplyingTransparent}
          onApply={() => {
            void applyTransparentPreview();
          }}
          onCancel={() => !isApplyingTransparent && setTransparentDialog(null)}
        />
      )}
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
  const [logoSize, setLogoSize] = useState(DEFAULT_LOGO_SIZE);
  const [logoFit, setLogoFit] = useState<LogoFit>("contain");
  const [logoPositionX, setLogoPositionX] = useState(DEFAULT_LOGO_POSITION);
  const [logoPositionY, setLogoPositionY] = useState(DEFAULT_LOGO_POSITION);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [popularBadgesEnabled, setPopularBadgesEnabled] = useState(true);
  const [reviewsEnabled, setReviewsEnabled] = useState(true);
  const [takeoverEnabled, setTakeoverEnabled] = useState(false);
  const [takeoverTitle, setTakeoverTitle] = useState("");
  const [takeoverMessage, setTakeoverMessage] = useState("");
  const [takeoverPrice, setTakeoverPrice] = useState("");
  const [takeoverAllergens, setTakeoverAllergens] = useState("");
  const [takeoverImageUrl, setTakeoverImageUrl] = useState("");
  const [popularCategoryStats, setPopularCategoryStats] =
    useState<PopularCategoryStats | null>(null);
  const [adminNotice, setAdminNotice] = useState<Notice | null>(null);
  const [reorderNotice, setReorderNotice] = useState<Notice | null>(null);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  type ReorderType = "categories" | "products";
  const reorderTimeoutsRef = React.useRef<
    Partial<Record<ReorderType, ReturnType<typeof setTimeout>>>
  >({});
  const pendingReordersRef = React.useRef<
    Partial<Record<ReorderType, number[]>>
  >({});

  const saveReorder = async (
    type: ReorderType,
    ids: number[],
    keepalive = false,
  ) => {
    await jsonRequest<void>(
      `/api/${type}/reorder`,
      "PUT",
      { ids },
      { keepalive },
    );
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
        setReorderNotice({ type: "info", message: "Saving order..." });
        await saveReorder(type, pendingIds);
        setReorderNotice({ type: "success", message: "Order saved." });
        window.setTimeout(() => setReorderNotice(null), 2500);
      } catch (error) {
        console.error(`Error reordering ${type}:`, error);
        setReorderNotice({
          type: "error",
          message: `Could not save the new ${type} order. Please try again.`,
        });
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
        const data = await apiRequest<{ authenticated: boolean }>(
          "/api/auth/session",
        );
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
    setSavingAction("logout");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      setRestaurant(null);
      setMenu([]);
      setAuthStatus("unauthenticated");
      setLoading(false);
      setSavingAction(null);
    }
  };

  const resetLogoDisplay = () => {
    setLogoSize(DEFAULT_LOGO_SIZE);
    setLogoFit("contain");
    setLogoPositionX(DEFAULT_LOGO_POSITION);
    setLogoPositionY(DEFAULT_LOGO_POSITION);
  };

  const clearLogo = () => {
    setLogoUrl("");
    resetLogoDisplay();
  };

  const applyRestaurantToForm = (rest: Restaurant) => {
    setEditRestaurantName(rest.name);
    setBackgroundUrl(rest.background_url || "");
    setLogoUrl(rest.logo_url || "");
    setLogoSize(
      clampNumber(
        rest.logo_size,
        MIN_LOGO_SIZE,
        MAX_LOGO_SIZE,
        DEFAULT_LOGO_SIZE,
      ),
    );
    setLogoFit(normalizeLogoFit(rest.logo_fit));
    setLogoPositionX(
      clampNumber(rest.logo_position_x, 0, 100, DEFAULT_LOGO_POSITION),
    );
    setLogoPositionY(
      clampNumber(rest.logo_position_y, 0, 100, DEFAULT_LOGO_POSITION),
    );
    setPhone(rest.phone || "");
    setAddress(rest.address || "");
    setWifiPassword(rest.wifi_password || "");
    setOpeningHours(rest.opening_hours || "");
    setFacebookUrl(rest.facebook_url || "");
    setInstagramUrl(rest.instagram_url || "");
    setPopularBadgesEnabled(rest.popular_badges_enabled !== 0);
    setReviewsEnabled(rest.reviews_enabled !== 0);
    setTakeoverEnabled(rest.takeover_enabled !== 0);
    setTakeoverTitle(rest.takeover_title || "");
    setTakeoverMessage(rest.takeover_message || "");
    setTakeoverPrice(rest.takeover_price || "");
    setTakeoverAllergens(rest.takeover_allergens || "");
    setTakeoverImageUrl(rest.takeover_image_url || "");
  };

  const fetchData = async () => {
    try {
      setAdminNotice(null);
      const rest = await apiRequest<Restaurant>(`/api/restaurant/${slug}`);
      setRestaurant(rest);
      applyRestaurantToForm(rest);

      const menuData = await apiRequest<Category[]>(`/api/menu/${rest.id}`);
      setMenu(menuData);
      const popularity = await apiRequest<PopularCategoryStats>(
        `/api/popularity/category/${rest.id}`,
      );
      setPopularCategoryStats(popularity);
      setPopularBadgesEnabled(popularity.enabled);
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthStatus("unauthenticated");
        return;
      }
      console.error("Error fetching data:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not load admin data.",
      });
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async () => {
    if (!restaurant) return;
    if (!newCategoryName.trim()) {
      setAdminNotice({ type: "error", message: "Category name is required." });
      return;
    }

    setSavingAction("category");
    setAdminNotice({ type: "info", message: "Adding category..." });
    try {
      const newCat = await jsonRequest<Category>("/api/categories", "POST", {
        restaurant_id: restaurant.id,
        name: newCategoryName.trim(),
        parent_id: null,
      });
      setMenu([...menu, newCat]);
      setNewCategoryName("");
      setAdminNotice({ type: "success", message: "Category added." });
    } catch (error: any) {
      console.error("Error adding category:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not add category.",
      });
    } finally {
      setSavingAction(null);
    }
  };

  const addSubcategory = async (parentId: number, name: string) => {
    if (!restaurant || !name.trim()) return;
    try {
      const newSub = await jsonRequest<Category>("/api/categories", "POST", {
        restaurant_id: restaurant.id,
        name: name.trim(),
        parent_id: parentId,
      });
      setMenu(
        menu.map((cat) =>
          cat.id === parentId
            ? { ...cat, subcategories: [...(cat.subcategories || []), newSub] }
            : cat,
        ),
      );
    } catch (error: any) {
      console.error("Error adding subcategory:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not add subcategory.",
      });
      throw error;
    }
  };

  const deleteCategory = async (id: number, parentId: number | null = null) => {
    setSavingAction(`delete-category-${id}`);
    try {
      await apiRequest<void>(`/api/categories/${id}`, { method: "DELETE" });

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
      setAdminNotice({ type: "success", message: "Category deleted." });
    } catch (error: any) {
      console.error("Error deleting category:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not delete category.",
      });
      throw error;
    } finally {
      setSavingAction(null);
    }
  };

  const updateCategory = async (
    id: number,
    data: { name: string; image_url?: string },
    parentId: number | null = null,
  ) => {
    try {
      const updated = await jsonRequest<Partial<Category>>(
        `/api/categories/${id}`,
        "PUT",
        data,
      );
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
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update category.",
      });
      throw error;
    }
  };

  const updateCategoryImage = async (
    id: number,
    imageUrl: string,
    parentId: number | null = null,
  ) => {
    try {
      const updated = await jsonRequest<Partial<Category>>(
        `/api/categories/${id}/image`,
        "PATCH",
        { image_url: imageUrl },
      );
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
      console.error("Error updating category image:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update category image.",
      });
      throw error;
    }
  };

  const addProduct = async (
    categoryId: number,
    product: ProductFormData,
    parentId: number | null = null,
  ) => {
    try {
      const newProd = await jsonRequest<Product>("/api/products", "POST", {
        category_id: categoryId,
        ...product,
      });

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
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not add product.",
      });
      throw error;
    }
  };

  const updateProduct = async (
    productId: number,
    categoryId: number,
    product: ProductFormData,
    parentId: number | null = null,
  ) => {
    try {
      const updatedProd = await jsonRequest<Product>(
        `/api/products/${productId}`,
        "PUT",
        product,
      );

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
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update product.",
      });
      throw error;
    }
  };

  const updateProductImage = async (
    productId: number,
    categoryId: number,
    imageUrl: string,
    parentId: number | null = null,
  ) => {
    try {
      const updatedProd = await jsonRequest<Partial<Product>>(
        `/api/products/${productId}/image`,
        "PATCH",
        { image_url: imageUrl },
      );

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
      console.error("Error updating product image:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update product image.",
      });
      throw error;
    }
  };

  const deleteProduct = async (
    productId: number,
    categoryId: number,
    parentId: number | null = null,
  ) => {
    setSavingAction(`delete-product-${productId}`);
    try {
      await apiRequest<void>(`/api/products/${productId}`, {
        method: "DELETE",
      });

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
      setAdminNotice({ type: "success", message: "Product deleted." });
    } catch (error: any) {
      console.error("Error deleting product:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not delete product.",
      });
      throw error;
    } finally {
      setSavingAction(null);
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
    if (!restaurant) return;
    const trimmedRestaurantName = editRestaurantName.trim();
    const trimmedBackgroundUrl = backgroundUrl.trim();
    const trimmedLogoUrl = logoUrl.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();
    const trimmedWifiPassword = wifiPassword.trim();
    const trimmedOpeningHours = openingHours.trim();
    const trimmedFacebookUrl = facebookUrl.trim();
    const trimmedInstagramUrl = instagramUrl.trim();
    const normalizedLogoSize = clampNumber(
      logoSize,
      MIN_LOGO_SIZE,
      MAX_LOGO_SIZE,
      DEFAULT_LOGO_SIZE,
    );
    const normalizedLogoFit = normalizeLogoFit(logoFit);
    const normalizedLogoPositionX = clampNumber(
      logoPositionX,
      0,
      100,
      DEFAULT_LOGO_POSITION,
    );
    const normalizedLogoPositionY = clampNumber(
      logoPositionY,
      0,
      100,
      DEFAULT_LOGO_POSITION,
    );

    if (!trimmedRestaurantName) {
      setAdminNotice({
        type: "error",
        message: "Restaurant name is required.",
      });
      return;
    }
    const urlFields = [
      ["logo", trimmedLogoUrl],
      ["hero background", trimmedBackgroundUrl],
      ["Facebook", trimmedFacebookUrl],
      ["Instagram", trimmedInstagramUrl],
      ["Takeover image", takeoverImageUrl.trim()],
    ] as const;
    const invalidUrl = urlFields.find(
      ([, value]) => !isValidOptionalUrl(value),
    );
    if (invalidUrl) {
      setAdminNotice({
        type: "error",
        message: `${invalidUrl[0]} URL must be empty, an uploaded image, or a valid http(s) URL.`,
      });
      return;
    }

    setSavingAction("restaurant");
    setAdminNotice({ type: "info", message: "Saving restaurant info..." });
    try {
      await jsonRequest(`/api/restaurant/${restaurant.id}`, "PUT", {
        name: trimmedRestaurantName,
        background_url: trimmedBackgroundUrl,
        logo_url: trimmedLogoUrl,
        logo_size: normalizedLogoSize,
        logo_fit: normalizedLogoFit,
        logo_position_x: normalizedLogoPositionX,
        logo_position_y: normalizedLogoPositionY,
        phone: trimmedPhone,
        address: trimmedAddress,
        wifi_password: trimmedWifiPassword,
        opening_hours: trimmedOpeningHours,
        facebook_url: trimmedFacebookUrl,
        instagram_url: trimmedInstagramUrl,
        takeover_enabled: takeoverEnabled ? 1 : 0,
        takeover_title: takeoverTitle.trim(),
        takeover_message: takeoverMessage.trim(),
        takeover_price: takeoverPrice.trim(),
        takeover_allergens: takeoverAllergens.trim(),
        takeover_image_url: takeoverImageUrl.trim(),
      });

      setRestaurant({
        ...restaurant,
        name: trimmedRestaurantName,
        background_url: trimmedBackgroundUrl,
        logo_url: trimmedLogoUrl,
        logo_size: normalizedLogoSize,
        logo_fit: normalizedLogoFit,
        logo_position_x: normalizedLogoPositionX,
        logo_position_y: normalizedLogoPositionY,
        phone: trimmedPhone,
        address: trimmedAddress,
        wifi_password: trimmedWifiPassword,
        opening_hours: trimmedOpeningHours,
        facebook_url: trimmedFacebookUrl,
        instagram_url: trimmedInstagramUrl,
        takeover_enabled: takeoverEnabled ? 1 : 0,
        takeover_title: takeoverTitle.trim(),
        takeover_message: takeoverMessage.trim(),
        takeover_price: takeoverPrice.trim(),
        takeover_allergens: takeoverAllergens.trim(),
        takeover_image_url: takeoverImageUrl.trim(),
      });
      setLogoSize(normalizedLogoSize);
      setLogoFit(normalizedLogoFit);
      setLogoPositionX(normalizedLogoPositionX);
      setLogoPositionY(normalizedLogoPositionY);
      setIsEditingRestaurant(false);
      setAdminNotice({
        type: "success",
        message: "Restaurant info updated.",
      });
    } catch (error: any) {
      console.error("Error updating restaurant info:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update restaurant info.",
      });
    } finally {
      setSavingAction(null);
    }
  };

  const updatePopularBadges = async (enabled: boolean) => {
    if (!restaurant) return;
    const previous = popularBadgesEnabled;
    setPopularBadgesEnabled(enabled);
    setSavingAction("popular-badges");
    setAdminNotice({
      type: "info",
      message: enabled
        ? "Enabling daily popular category..."
        : "Disabling daily popular category...",
    });
    try {
      await jsonRequest(
        `/api/restaurant/${restaurant.id}/popular-badges`,
        "PUT",
        {
          enabled,
        },
      );
      const popularity = await apiRequest<PopularCategoryStats>(
        `/api/popularity/category/${restaurant.id}`,
      );
      setRestaurant({
        ...restaurant,
        popular_badges_enabled: enabled ? 1 : 0,
      });
      setPopularCategoryStats(popularity);
      setAdminNotice({
        type: "success",
        message: enabled
          ? "Daily popular category enabled."
          : "Daily popular category disabled.",
      });
    } catch (error: any) {
      console.error("Error updating popular badges:", error);
      setPopularBadgesEnabled(previous);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update daily popular category.",
      });
    } finally {
      setSavingAction(null);
    }
  };

  const updateReviewsEnabled = async (enabled: boolean) => {
    if (!restaurant) return;
    const previous = reviewsEnabled;
    setReviewsEnabled(enabled);
    setSavingAction("reviews-enabled");
    setAdminNotice({
      type: "info",
      message: enabled ? "Enabling reviews..." : "Disabling reviews...",
    });
    try {
      await jsonRequest(
        `/api/restaurant/${restaurant.id}/reviews-enabled`,
        "PUT",
        {
          enabled,
        },
      );
      setRestaurant({
        ...restaurant,
        reviews_enabled: enabled ? 1 : 0,
      });
      setAdminNotice({
        type: "success",
        message: enabled
          ? "Reviews feature enabled."
          : "Reviews feature disabled.",
      });
    } catch (error: any) {
      console.error("Error updating reviews enabled setting:", error);
      setReviewsEnabled(previous);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not update reviews setting.",
      });
    } finally {
      setSavingAction(null);
    }
  };

  const saveTakeoverSettings = async () => {
    if (!restaurant) return;
    setSavingAction("takeover");
    setAdminNotice({ type: "info", message: "Saving promo popup settings..." });
    try {
      await jsonRequest(`/api/restaurant/${restaurant.id}`, "PUT", {
        name: restaurant.name,
        background_url: restaurant.background_url || "",
        logo_url: restaurant.logo_url || "",
        logo_size: restaurant.logo_size ?? 100,
        logo_fit: restaurant.logo_fit ?? "contain",
        logo_position_x: restaurant.logo_position_x ?? 50,
        logo_position_y: restaurant.logo_position_y ?? 50,
        phone: restaurant.phone || "",
        address: restaurant.address || "",
        wifi_password: restaurant.wifi_password || "",
        opening_hours: restaurant.opening_hours || "",
        facebook_url: restaurant.facebook_url || "",
        instagram_url: restaurant.instagram_url || "",
        takeover_enabled: takeoverEnabled ? 1 : 0,
        takeover_title: takeoverTitle.trim(),
        takeover_message: takeoverMessage.trim(),
        takeover_price: takeoverPrice.trim(),
        takeover_allergens: takeoverAllergens.trim(),
        takeover_image_url: takeoverImageUrl.trim(),
      });
      setRestaurant({
        ...restaurant,
        takeover_enabled: takeoverEnabled ? 1 : 0,
        takeover_title: takeoverTitle.trim(),
        takeover_message: takeoverMessage.trim(),
        takeover_price: takeoverPrice.trim(),
        takeover_allergens: takeoverAllergens.trim(),
        takeover_image_url: takeoverImageUrl.trim(),
      });
      setAdminNotice({ type: "success", message: "Promo popup settings saved." });
    } catch (error: any) {
      console.error("Error saving takeover settings:", error);
      setAdminNotice({
        type: "error",
        message: error?.message || "Could not save promo popup settings.",
      });
    } finally {
      setSavingAction(null);
    }
  };

  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<"logo" | "background" | null>(
    null,
  );
  const cropObjectUrlRef = useRef<string | null>(null);

  const closeCropper = () => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
      cropObjectUrlRef.current = null;
    }
    setCropImageSrc(null);
    setCropTarget(null);
  };

  const openCropper = (file: File, target: "logo" | "background") => {
    if (cropObjectUrlRef.current) {
      URL.revokeObjectURL(cropObjectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    cropObjectUrlRef.current = objectUrl;
    setCropImageSrc(objectUrl);
    setCropTarget(target);
  };

  useEffect(
    () => () => {
      if (cropObjectUrlRef.current) {
        URL.revokeObjectURL(cropObjectUrlRef.current);
        cropObjectUrlRef.current = null;
      }
    },
    [],
  );

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = e.target;
    if (file) {
      openCropper(file, "background");
      target.value = "";
    } else {
      target.value = "";
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = e.target;
    if (file) {
      openCropper(file, "logo");
      target.value = "";
    } else {
      target.value = "";
    }
  };

  const adminStats = useMemo(() => {
    const categories = menu.flatMap((category) => [
      category,
      ...(category.subcategories || []),
    ]);
    const products = categories.flatMap((category) => category.products || []);
    const availableProducts = products.filter(
      (product) => product.is_available !== 0,
    );
    const soldOutProducts = products.length - availableProducts.length;
    const productsWithoutImages = products.filter(
      (product) => !product.image_url,
    ).length;

    return {
      categories: categories.length,
      products: products.length,
      availableProducts: availableProducts.length,
      soldOutProducts,
      productsWithoutImages,
    };
  }, [menu]);

  if (authStatus === "checking" || loading)
    return (
      <div className="flex items-center justify-center h-screen">
        Loading...
      </div>
    );

  if (authStatus === "unauthenticated")
    return (
      <AdminLoginView
        password={adminPassword}
        showPassword={showAdminPassword}
        error={loginError}
        isLoggingIn={isLoggingIn}
        onPasswordChange={setAdminPassword}
        onTogglePassword={() => setShowAdminPassword((visible) => !visible)}
        onSubmit={login}
      />
    );

  if (!restaurant) return <div>Restaurant not found</div>;

  const menuUrl = `${window.location.origin}/${restaurant.slug}`;
  const logoObjectPosition = `${logoPositionX}% ${logoPositionY}%`;
  const logoPreviewStyle: React.CSSProperties = {
    objectFit: logoFit,
    objectPosition: logoObjectPosition,
  };
  const logoInputValue = isDataImageUrl(logoUrl) ? "" : logoUrl;
  const backgroundInputValue = isDataImageUrl(backgroundUrl)
    ? ""
    : backgroundUrl;
  const activePopularCategoryName =
    popularCategoryStats?.active_category?.name || "No winner yet";
  const currentLeaderName =
    popularCategoryStats?.current_leader?.name || "No views yet";

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
                        applyRestaurantToForm(restaurant);
                        setIsEditingRestaurant(false);
                      }
                    }}
                  />
                  <button
                    onClick={updateRestaurantInfo}
                    disabled={savingAction === "restaurant"}
                    className="bg-stone-900 text-stone-50 px-4 py-2 rounded-lg hover:bg-stone-800 disabled:opacity-60 transition-colors"
                  >
                    {savingAction === "restaurant" ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      applyRestaurantToForm(restaurant);
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
                      <div className="relative group bg-stone-100 rounded-xl border-2 border-dashed border-stone-200 w-32 h-20 flex items-center justify-center overflow-hidden">
                        {logoUrl ? (
                          <>
                            <img
                              src={logoUrl}
                              alt="Logo Preview"
                              className="w-full h-full"
                              style={logoPreviewStyle}
                            />
                            {/* Delete button — no file input behind it */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                clearLogo();
                              }}
                              className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              title="Remove logo"
                            >
                              <X size={14} />
                            </button>
                            {/* Change-image label (bottom strip) */}
                            <label
                              className="absolute bottom-0 inset-x-0 text-center text-[9px] font-semibold bg-black/40 text-white py-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              title="Change logo"
                            >
                              Change
                              <input
                                type="file"
                                accept={ACCEPTED_IMAGE_FORMATS}
                                className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                                onChange={handleLogoUpload}
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="text-stone-300" size={24} />
                            {/* File input only covers the empty state area */}
                            <input
                              type="file"
                              accept={ACCEPTED_IMAGE_FORMATS}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={handleLogoUpload}
                            />
                          </>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder={
                            isDataImageUrl(logoUrl)
                              ? "Uploaded logo"
                              : "Or enter image URL..."
                          }
                          className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-400"
                          value={logoInputValue}
                          onChange={(e) => {
                            setLogoUrl(e.target.value);
                            if (!e.target.value.trim()) resetLogoDisplay();
                          }}
                        />
                        <p className="text-[10px] text-stone-400 mt-1 italic">
                          Shown in the hero banner and footer.
                        </p>
                        {logoUrl && (
                          <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3 space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <label className="text-[10px] font-bold uppercase text-stone-400">
                                  Size
                                </label>
                                <span className="text-[10px] font-semibold text-stone-500">
                                  {logoSize}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min={MIN_LOGO_SIZE}
                                max={MAX_LOGO_SIZE}
                                step="5"
                                value={logoSize}
                                onChange={(e) =>
                                  setLogoSize(Number(e.target.value))
                                }
                                className="w-full accent-stone-900"
                                aria-label="Logo size"
                              />
                            </div>

                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-bold uppercase text-stone-400">
                                Mode
                              </span>
                              <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
                                {(["contain", "cover"] as const).map((fit) => (
                                  <button
                                    key={fit}
                                    type="button"
                                    onClick={() => setLogoFit(fit)}
                                    className={`rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                                      logoFit === fit
                                        ? "bg-stone-900 text-white"
                                        : "text-stone-500 hover:text-stone-900"
                                    }`}
                                  >
                                    {fit === "contain" ? "Fit" : "Crop"}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {logoFit === "cover" && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-[10px] font-bold uppercase text-stone-400">
                                      Crop X
                                    </label>
                                    <span className="text-[10px] font-semibold text-stone-500">
                                      {logoPositionX}%
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="5"
                                    value={logoPositionX}
                                    onChange={(e) =>
                                      setLogoPositionX(Number(e.target.value))
                                    }
                                    className="w-full accent-stone-900"
                                    aria-label="Logo horizontal crop position"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-[10px] font-bold uppercase text-stone-400">
                                      Crop Y
                                    </label>
                                    <span className="text-[10px] font-semibold text-stone-500">
                                      {logoPositionY}%
                                    </span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="5"
                                    value={logoPositionY}
                                    onChange={(e) =>
                                      setLogoPositionY(Number(e.target.value))
                                    }
                                    className="w-full accent-stone-900"
                                    aria-label="Logo vertical crop position"
                                  />
                                </div>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={resetLogoDisplay}
                              className="text-[10px] font-bold uppercase tracking-wide text-stone-400 hover:text-stone-900"
                            >
                              Reset logo display
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase">
                      Hero Background Image
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="relative group bg-stone-100 rounded-xl border-2 border-dashed border-stone-200 w-32 h-20 flex items-center justify-center overflow-hidden">
                        {backgroundUrl ? (
                          <>
                            <img
                              src={backgroundUrl}
                              alt="Background Preview"
                              className="w-full h-full object-cover"
                            />
                            {/* Delete button — no file input behind it */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBackgroundUrl("");
                              }}
                              className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              title="Remove background"
                            >
                              <X size={14} />
                            </button>
                            {/* Change-image label (bottom strip) */}
                            <label
                              className="absolute bottom-0 inset-x-0 text-center text-[9px] font-semibold bg-black/40 text-white py-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                              title="Change background"
                            >
                              Change
                              <input
                                type="file"
                                accept={ACCEPTED_IMAGE_FORMATS}
                                className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                                onChange={handleBackgroundUpload}
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="text-stone-300" size={24} />
                            {/* File input only covers the empty state area */}
                            <input
                              type="file"
                              accept={ACCEPTED_IMAGE_FORMATS}
                              className="absolute inset-0 opacity-0 cursor-pointer"
                              onChange={handleBackgroundUpload}
                            />
                          </>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder={
                            isDataImageUrl(backgroundUrl)
                              ? "Uploaded hero image"
                              : "Or enter image URL..."
                          }
                          className="w-full text-sm bg-white border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-400"
                          value={backgroundInputValue}
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
            <div className="mt-4 space-y-2">
              <InlineNotice notice={adminNotice} />
              <InlineNotice notice={reorderNotice} />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={logout}
              disabled={savingAction === "logout"}
              className="flex items-center gap-2 border border-stone-300 px-4 py-2 rounded-full text-sm hover:bg-stone-100 transition-colors"
            >
              <LogOut size={16} />
              {savingAction === "logout" ? "Logging out..." : "Logout"}
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

        <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              Categories
            </p>
            <p className="text-2xl font-serif mt-1">{adminStats.categories}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              Products
            </p>
            <p className="text-2xl font-serif mt-1">{adminStats.products}</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              Available
            </p>
            <p className="text-2xl font-serif mt-1">
              {adminStats.availableProducts}
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              Sold out
            </p>
            <p className="text-2xl font-serif mt-1">
              {adminStats.soldOutProducts}
            </p>
          </div>
          <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 col-span-2 md:col-span-1">
            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">
              No photo
            </p>
            <p className="text-2xl font-serif mt-1">
              {adminStats.productsWithoutImages}
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-xl border border-stone-200 bg-white px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Star size={17} fill="currentColor" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">
                  Daily popular category
                </p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-500">
                  Counts category opens from 3:00 to 3:00. After the cutoff, the
                  most viewed category from the previous window gets the Popular
                  badge.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-stone-500 md:grid-cols-3">
                  <div className="rounded-lg bg-stone-50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
                      Active popular
                    </p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {activePopularCategoryName}
                    </p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
                      Current leader
                    </p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {currentLeaderName}
                      {popularCategoryStats?.current_leader?.views
                        ? ` (${popularCategoryStats.current_leader.views})`
                        : ""}
                    </p>
                  </div>
                  <div className="rounded-lg bg-stone-50 px-3 py-2">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-stone-400">
                      Next update
                    </p>
                    <p className="mt-1 font-semibold text-stone-900">
                      03:00 {popularCategoryStats?.time_zone || "local"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updatePopularBadges(!popularBadgesEnabled)}
              disabled={savingAction === "popular-badges"}
              className={`inline-flex min-w-28 items-center justify-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60 ${
                popularBadgesEnabled
                  ? "bg-stone-900 text-white hover:bg-stone-800"
                  : "border border-stone-300 bg-white text-stone-500 hover:text-stone-900"
              }`}
            >
              {savingAction === "popular-badges"
                ? "Saving..."
                : popularBadgesEnabled
                  ? "Enabled"
                  : "Disabled"}
            </button>
          </div>
        </section>

        <section className="mb-8 rounded-xl border border-stone-200 bg-white px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Star size={17} fill="currentColor" strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">
                  Customer Reviews
                </p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-500">
                  Enable or disable customer reviews and ratings on your public
                  menu. If enabled, a reviews icon will be shown on the menu,
                  and users can submit star ratings and comments.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateReviewsEnabled(!reviewsEnabled)}
              disabled={savingAction === "reviews-enabled"}
              className={`inline-flex min-w-28 items-center justify-center rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60 ${
                reviewsEnabled
                  ? "bg-stone-900 text-white hover:bg-stone-800"
                  : "border border-stone-300 bg-white text-stone-500 hover:text-stone-900"
              }`}
            >
              {savingAction === "reviews-enabled"
                ? "Saving..."
                : reviewsEnabled
                  ? "Enabled"
                  : "Disabled"}
            </button>
          </div>
        </section>

        {/* ── Special Promo Popup ─────────────────────────── */}
        <section className="mb-8 rounded-xl border border-stone-200 bg-white px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                <Sparkles size={17} />
              </div>
              <div>
                <p className="text-sm font-bold text-stone-900">Special Promo Popup</p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-stone-500">
                  Show a full-screen animated popup when a customer opens the menu. Appears only once per session. Ideal for daily specials, promotions, or announcements.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-4 shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={takeoverEnabled}
                onChange={(e) => setTakeoverEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-stone-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
            </label>
          </div>

          <div className="space-y-4 pt-4 border-t border-stone-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase tracking-widest">Headline</label>
                <input
                  type="text"
                  placeholder="e.g. Special of the day!"
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:bg-white transition-colors"
                  value={takeoverTitle}
                  onChange={(e) => setTakeoverTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase tracking-widest">Price</label>
                <input
                  type="text"
                  placeholder="e.g. 500 MKD"
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:bg-white transition-colors"
                  value={takeoverPrice}
                  onChange={(e) => setTakeoverPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-stone-400 font-bold ml-1 uppercase tracking-widest">Description</label>
              <textarea
                placeholder="Describe the special..."
                className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-stone-400 focus:bg-white transition-colors min-h-[80px]"
                value={takeoverMessage}
                onChange={(e) => setTakeoverMessage(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-stone-400 font-bold block">Allergens</label>
              <AllergenPicker
                selected={takeoverAllergens ? takeoverAllergens.split(",") : []}
                onChange={(allergens) => setTakeoverAllergens(allergens.join(","))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Promo Image</label>
              <div className="flex items-center gap-4">
                <div className="relative group bg-stone-50 rounded-xl border-2 border-dashed border-stone-200 w-36 h-24 flex items-center justify-center overflow-hidden">
                  {takeoverImageUrl ? (
                    <>
                      <img src={takeoverImageUrl} alt="Promo" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setTakeoverImageUrl(""); }}
                        className="absolute top-1 right-1 bg-white/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="Remove image"
                      >
                        <X size={14} />
                      </button>
                      <label
                        className="absolute bottom-0 inset-x-0 text-center text-[9px] font-semibold bg-black/40 text-white py-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Change image"
                      >
                        Change
                        <input
                          type="file"
                          accept={ACCEPTED_IMAGE_FORMATS}
                          className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => setTakeoverImageUrl(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="text-stone-300" size={24} />
                      <input
                        type="file"
                        accept={ACCEPTED_IMAGE_FORMATS}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => setTakeoverImageUrl(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }}
                      />
                    </>
                  )}
                </div>
                <p className="text-xs text-stone-500">Click to upload a promo image.<br />It will appear full-screen behind the popup text.</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={saveTakeoverSettings}
                disabled={savingAction === "takeover"}
                className="bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-stone-800 disabled:opacity-60 transition-colors"
              >
                {savingAction === "takeover" ? "Saving..." : "Save Promo Settings"}
              </button>
            </div>
          </div>
        </section>

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
              disabled={savingAction === "category"}
              className="bg-stone-900 text-stone-50 p-3 rounded-xl hover:bg-stone-800 disabled:opacity-60 transition-colors"
              aria-label="Add category"
            >
              {savingAction === "category" ? (
                <Loader2 size={24} className="animate-spin" />
              ) : (
                <Plus size={24} />
              )}
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
                  onUpdateCategoryImage={updateCategoryImage}
                  onAddProduct={addProduct}
                  onUpdateProduct={updateProduct}
                  onUpdateProductImage={updateProductImage}
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
                      await jsonRequest(
                        `/api/categories/${cid}/products/bulk`,
                        "POST",
                        { products: prods },
                      );
                      const data = await apiRequest<Category[]>(
                        `/api/menu/${restaurant.id}`,
                      );
                      setMenu(data);
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

      {cropImageSrc && cropTarget && (
        <ImageCropper
          imageSrc={cropImageSrc}
          title={
            cropTarget === "background" ? "Crop Hero Background" : "Crop Logo"
          }
          aspect={cropTarget === "background" ? 16 / 9 : undefined}
          maxOutputWidth={cropTarget === "background" ? 1920 : 1200}
          maxOutputHeight={cropTarget === "background" ? 1080 : 1200}
          outputMimeType={
            cropTarget === "background" ? "image/jpeg" : "image/png"
          }
          outputQuality={0.88}
          onCropComplete={(croppedDataUrl) => {
            if (cropTarget === "logo") {
              setLogoUrl(croppedDataUrl);
            } else if (cropTarget === "background") {
              setBackgroundUrl(croppedDataUrl);
            }
            closeCropper();
          }}
          onCancel={closeCropper}
        />
      )}
    </div>
  );
}
