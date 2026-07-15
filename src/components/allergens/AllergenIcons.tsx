import React from "react";
import type { AllergenKey } from "../../../shared/types";

interface AllergenIconProps {
  size?: number;
}

// EU-style allergen icons as inline SVGs
const GlutenIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#F59E0B"/>
    <line x1="18" y1="28" x2="18" y2="8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <ellipse cx="13" cy="13" rx="3.5" ry="2.2" fill="white" transform="rotate(-35 13 13)"/>
    <ellipse cx="13" cy="19" rx="3.5" ry="2.2" fill="white" transform="rotate(-35 13 19)"/>
    <ellipse cx="23" cy="13" rx="3.5" ry="2.2" fill="white" transform="rotate(35 23 13)"/>
    <ellipse cx="23" cy="19" rx="3.5" ry="2.2" fill="white" transform="rotate(35 23 19)"/>
    <ellipse cx="18" cy="9" rx="2.5" ry="1.8" fill="white"/>
  </svg>
);

const NutsIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#92400E"/>
    <ellipse cx="13.5" cy="18" rx="5.5" ry="7" fill="white"/>
    <ellipse cx="22.5" cy="18" rx="5.5" ry="7" fill="white"/>
    <rect x="15.5" y="15.5" width="5" height="5" fill="white"/>
    <line x1="18" y1="14" x2="18" y2="22" stroke="#92400E" strokeWidth="1.5"/>
    <circle cx="13.5" cy="17" r="1.2" fill="#92400E" opacity="0.4"/>
    <circle cx="22.5" cy="17" r="1.2" fill="#92400E" opacity="0.4"/>
  </svg>
);

const DairyIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#3B82F6"/>
    <path d="M13 10 L13 9 Q13 7 15 7 L21 7 Q23 7 23 9 L23 10 L25 14 L25 27 Q25 29 23 29 L13 29 Q11 29 11 27 L11 14 Z" fill="white"/>
    <path d="M13.5 19 Q18 22 22.5 19 L22.5 27 Q22.5 28 21.5 28 L14.5 28 Q13.5 28 13.5 27 Z" fill="#93C5FD"/>
    <circle cx="16" cy="16" r="1.2" fill="#DBEAFE"/>
    <circle cx="20" cy="14" r="0.9" fill="#DBEAFE"/>
  </svg>
);

const EggsIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#D97706"/>
    <path d="M18 7 C12 7 9 12 9 18 C9 24 13 29 18 29 C23 29 27 24 27 18 C27 12 24 7 18 7 Z" fill="white"/>
    <circle cx="18" cy="20" r="5.5" fill="#FCD34D"/>
    <circle cx="16.5" cy="18.5" r="1.5" fill="white" opacity="0.6"/>
  </svg>
);

const FishIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#0EA5E9"/>
    <path d="M8 18 C8 18 14 10 22 14 C26 16 27 18 27 18 C27 18 26 20 22 22 C14 26 8 18 8 18 Z" fill="white"/>
    <path d="M8 18 L5 13 L5 23 Z" fill="white"/>
    <circle cx="21" cy="17" r="1.8" fill="#0EA5E9"/>
    <circle cx="21.5" cy="16.5" r="0.6" fill="white"/>
    <path d="M15 15 Q17 14 17 17" stroke="#93C5FD" strokeWidth="1" fill="none"/>
    <path d="M12 16 Q14 15 14 18" stroke="#93C5FD" strokeWidth="1" fill="none"/>
  </svg>
);

const SoyIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#16A34A"/>
    <path d="M18 28 C18 28 11 25 11 18 C11 11 15 8 18 8 C21 8 25 11 25 18 C25 25 18 28 18 28 Z" fill="white"/>
    <circle cx="18" cy="13" r="2.8" fill="#86EFAC"/>
    <circle cx="15" cy="20" r="2.8" fill="#86EFAC"/>
    <circle cx="21" cy="20" r="2.8" fill="#86EFAC"/>
    <circle cx="17" cy="12" r="1" fill="white" opacity="0.6"/>
  </svg>
);

const SesameIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#B45309"/>
    <ellipse cx="14" cy="12" rx="3" ry="5" fill="white" transform="rotate(20 14 12)"/>
    <ellipse cx="22" cy="11" rx="3" ry="5" fill="white" transform="rotate(-15 22 11)"/>
    <ellipse cx="11" cy="22" rx="3" ry="5" fill="white" transform="rotate(10 11 22)"/>
    <ellipse cx="22" cy="22" rx="3" ry="5" fill="white" transform="rotate(-20 22 22)"/>
    <ellipse cx="17" cy="19" rx="3" ry="5" fill="white" transform="rotate(5 17 19)"/>
    <line x1="13.3" y1="9.5" x2="14.7" y2="14.5" stroke="#B45309" strokeWidth="0.8" opacity="0.5"/>
    <line x1="21.5" y1="8.5" x2="22.5" y2="13.5" stroke="#B45309" strokeWidth="0.8" opacity="0.5"/>
  </svg>
);

const CeleryIcon: React.FC<AllergenIconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#65A30D"/>
    <path d="M14 28 C14 28 12 20 13 10 C13 10 15 12 14 28 Z" fill="white"/>
    <path d="M18 28 C18 28 17 19 18 8 C18 8 20 11 18 28 Z" fill="white"/>
    <path d="M22 28 C22 28 21 20 23 10 C23 10 25 13 22 28 Z" fill="white"/>
    <path d="M13 12 C10 8 8 12 12 15 Z" fill="#D9F99D"/>
    <path d="M18 9 C16 5 13 8 17 12 Z" fill="#D9F99D"/>
    <path d="M23 11 C26 7 28 11 24 14 Z" fill="#D9F99D"/>
  </svg>
);

export const ALLERGEN_SVG_ICONS: Record<AllergenKey, React.FC<AllergenIconProps>> = {
  gluten: GlutenIcon,
  nuts: NutsIcon,
  dairy: DairyIcon,
  eggs: EggsIcon,
  fish: FishIcon,
  soy: SoyIcon,
  sesame: SesameIcon,
  celery: CeleryIcon,
};

// ─── AllergenBadge: displayed in the menu view with hover tooltip ───────────

interface AllergenBadgeProps {
  allergenKey: AllergenKey;
  label: string;
  size?: number;
}

export const AllergenBadge: React.FC<AllergenBadgeProps> = ({
  allergenKey,
  label,
  size = 28,
}) => {
  const Icon = ALLERGEN_SVG_ICONS[allergenKey];
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
    >
      <Icon size={size} />
      {showTooltip && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
          style={{ whiteSpace: "nowrap" }}
        >
          <div className="bg-stone-900 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-xl">
            {label}
          </div>
          <div
            className="absolute top-full left-1/2 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #1C1917",
            }}
          />
        </div>
      )}
    </div>
  );
};

// ─── AllergenPicker: used in admin panel to click icons instead of typing ───

interface AllergenPickerProps {
  value: string; // comma-separated allergen keys
  onChange: (value: string) => void;
}

const ALLERGEN_LIST: { key: AllergenKey; label: string }[] = [
  { key: "gluten", label: "Gluten" },
  { key: "nuts", label: "Nuts" },
  { key: "dairy", label: "Dairy" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "soy", label: "Soy" },
  { key: "sesame", label: "Sesame" },
  { key: "celery", label: "Celery" },
];

export const AllergenPicker: React.FC<AllergenPickerProps> = ({
  value,
  onChange,
}) => {
  const selected = new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const toggle = (key: AllergenKey) => {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(Array.from(next).join(","));
  };

  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {ALLERGEN_LIST.map(({ key, label }) => {
        const Icon = ALLERGEN_SVG_ICONS[key];
        const isSelected = selected.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            title={label}
            className={`relative flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition-all duration-150 cursor-pointer select-none
              ${
                isSelected
                  ? "border-stone-700 bg-stone-50 shadow-md scale-105"
                  : "border-stone-200 bg-white hover:border-stone-400 hover:bg-stone-50 opacity-55 hover:opacity-90"
              }`}
          >
            <Icon size={32} />
            <span className="text-[9px] font-bold uppercase tracking-wide text-stone-500 leading-none">
              {label}
            </span>
            {isSelected && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-stone-800 text-white rounded-full text-[9px] flex items-center justify-center font-bold leading-none">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
