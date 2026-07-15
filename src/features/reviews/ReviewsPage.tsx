import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Star,
  Send,
  Moon,
  Sun,
  MessageSquarePlus,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Trash2,
  User,
} from "lucide-react";
import type { Review, Restaurant } from "../../../shared/types";

// ─── Star Picker ─────────────────────────────────────────────────────────────

const StarPicker: React.FC<{
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled = false }) => {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  const labels = ["Terrible", "Poor", "Average", "Good", "Excellent"];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onMouseEnter={() => !disabled && setHovered(star)}
            onMouseLeave={() => !disabled && setHovered(0)}
            onClick={() => !disabled && onChange(star)}
            className="relative transition-transform duration-150 disabled:cursor-default"
            style={{ transform: display >= star ? "scale(1.15)" : "scale(1)" }}
            aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
          >
            <Star
              size={38}
              className="transition-all duration-150"
              style={{
                fill: display >= star ? "#f59e0b" : "transparent",
                color: display >= star ? "#f59e0b" : "#d1d5db",
                filter:
                  display >= star
                    ? "drop-shadow(0 0 6px rgba(245,158,11,0.55))"
                    : "none",
              }}
            />
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        {display > 0 && (
          <motion.p
            key={display}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="text-sm font-semibold tracking-wide"
            style={{ color: "#f59e0b" }}
          >
            {labels[display - 1]}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Star Display (read-only) ─────────────────────────────────────────────────

const StarDisplay: React.FC<{ rating: number; size?: number }> = ({
  rating,
  size = 14,
}) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3, 4, 5].map((s) => (
      <Star
        key={s}
        size={size}
        style={{
          fill: s <= rating ? "#f59e0b" : "transparent",
          color: s <= rating ? "#f59e0b" : "#d1d5db",
        }}
      />
    ))}
  </div>
);

// ─── Format Date ─────────────────────────────────────────────────────────────

const formatDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
};

// ─── Average Stars ────────────────────────────────────────────────────────────

const AverageStars: React.FC<{ reviews: Review[] }> = ({ reviews }) => {
  if (reviews.length === 0) return null;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return (
    <div className="flex items-center gap-2">
      <span className="text-3xl font-bold text-amber-400">
        {avg.toFixed(1)}
      </span>
      <div>
        <StarDisplay rating={Math.round(avg)} size={16} />
        <p className="text-xs text-stone-400 mt-0.5">
          {reviews.length} review{reviews.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
};

// ─── Main ReviewsPage ─────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const viewOnly = searchParams.get("view") === "list";

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsEnabled, setReviewsEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("menuDarkMode") !== "0";
    } catch {
      return true;
    }
  });

  // Form state
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(!viewOnly);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (darkMode) {
      document.documentElement.classList.remove("light-mode");
      if (meta) meta.setAttribute("content", "#1c1917");
    } else {
      document.documentElement.classList.add("light-mode");
      if (meta) meta.setAttribute("content", "#fcfbf7");
    }
  }, [darkMode]);

  const toggleDark = () => {
    setDarkMode((d) => {
      localStorage.setItem("menuDarkMode", d ? "0" : "1");
      return !d;
    });
  };

  const fetchData = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      // Get restaurant info
      const menuRes = await fetch(`/api/public-menu/${slug}`, {
        cache: "no-store",
      });
      if (menuRes.ok) {
        const data = await menuRes.json();
        setRestaurant(data.restaurant);
        setReviewsEnabled(data.restaurant?.reviews_enabled !== 0);
      }

      // Get reviews
      if (menuRes.ok) {
        const data = await menuRes.json().catch(() => null);
        if (data?.restaurant?.id) {
          const revRes = await fetch(`/api/reviews/${data.restaurant.id}`);
          if (revRes.ok) {
            const revData = await revRes.json();
            setReviews(revData.reviews || []);
            setReviewsEnabled(revData.reviews_enabled !== false);
          }
        }
      }
    } catch (err) {
      console.error("Error loading reviews page:", err);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Better fetch: separate calls
  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const menuRes = await fetch(`/api/public-menu/${slug}`, {
          cache: "no-store",
        });
        if (!menuRes.ok) return;
        const menuData = await menuRes.json();
        const rest = menuData.restaurant;
        setRestaurant(rest);
        setReviewsEnabled(rest?.reviews_enabled !== 0);

        if (rest?.id) {
          const revRes = await fetch(`/api/reviews/${rest.id}`);
          if (revRes.ok) {
            const revData = await revRes.json();
            setReviews(revData.reviews || []);
            setReviewsEnabled(revData.reviews_enabled !== false);
          }
        }

        // Check admin
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const s = await sessionRes.json();
          setIsAdminAuthenticated(!!s.authenticated);
        }
      } catch (err) {
        console.error("Error loading:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setSubmitStatus({ type: "error", message: "Please select a star rating." });
      return;
    }
    if (!restaurant?.id) return;
    setSubmitting(true);
    setSubmitStatus(null);
    try {
      const res = await fetch(`/api/reviews/${restaurant.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: authorName.trim() || "Anonymous",
          rating,
          comment: comment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit review.");
      setReviews((prev) => [data.review, ...prev]);
      setRating(0);
      setAuthorName("");
      setComment("");
      setSubmitStatus({ type: "success", message: "Thank you for your review! 🎉" });
      setShowForm(false);
    } catch (err: any) {
      setSubmitStatus({ type: "error", message: err.message || "Could not submit review." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (reviewId: number) => {
    if (!restaurant?.id) return;
    setDeletingId(reviewId);
    try {
      const res = await fetch(`/api/reviews/${restaurant.id}/${reviewId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      }
    } catch (err) {
      console.error("Error deleting review:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // ── Themes
  const bg = darkMode ? "bg-[#0f0e0d]" : "bg-[#faf9f6]";
  const cardBg = darkMode
    ? "bg-stone-900/80 border-stone-700/60"
    : "bg-white/80 border-stone-200";
  const textPrimary = darkMode ? "text-stone-100" : "text-stone-900";
  const textSecondary = darkMode ? "text-stone-400" : "text-stone-500";
  const inputBg = darkMode
    ? "bg-stone-800 border-stone-700 text-stone-100 placeholder-stone-500 focus:border-amber-500/60 focus:ring-amber-500/20"
    : "bg-stone-50 border-stone-200 text-stone-900 placeholder-stone-400 focus:border-amber-400 focus:ring-amber-400/20";

  if (loading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${bg} ${textPrimary}`}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        >
          <Star size={32} className="text-amber-400" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen font-sans ${bg} ${textPrimary} transition-colors duration-300`}>
      {/* Decorative background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #f59e0b, transparent)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ background: "radial-gradient(circle, #a855f7, transparent)" }}
        />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-6">
        {/* ── Header */}
        <header className="flex items-center justify-between mb-8">
          <Link
            to={`/${slug}`}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition-all hover:scale-105 ${
              darkMode
                ? "border-stone-700 text-stone-300 hover:border-stone-500 hover:text-white bg-stone-900/60 backdrop-blur"
                : "border-stone-200 text-stone-600 hover:border-stone-400 hover:text-stone-900 bg-white/60 backdrop-blur"
            }`}
          >
            <ArrowLeft size={16} />
            {restaurant?.name || "Menu"}
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className={`h-9 w-9 inline-flex items-center justify-center rounded-full border transition-all hover:scale-105 ${
                darkMode
                  ? "border-stone-700 bg-stone-900/60 text-amber-400 hover:text-amber-300"
                  : "border-stone-200 bg-white/60 text-stone-400 hover:text-stone-900"
              }`}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* ── Page title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                boxShadow: "0 4px 16px rgba(245,158,11,0.35)",
              }}
            >
              <Star size={20} fill="white" color="white" />
            </div>
            <h1 className={`text-3xl font-serif ${textPrimary}`}>Reviews</h1>
          </div>
          <p className={`text-sm ${textSecondary} ml-13`}>
            {restaurant?.name ? `Share your experience at ${restaurant.name}` : "Share your experience"}
          </p>

          {/* Average summary */}
          {reviews.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className={`mt-4 inline-flex items-center gap-3 px-4 py-3 rounded-2xl border ${cardBg} backdrop-blur`}
            >
              <AverageStars reviews={reviews} />
            </motion.div>
          )}
        </motion.div>

        {!reviewsEnabled ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`rounded-3xl border p-10 text-center ${cardBg} backdrop-blur`}
          >
            <Star size={40} className={`mx-auto mb-4 ${textSecondary}`} />
            <p className={`text-lg font-medium ${textPrimary}`}>
              Reviews are not available at the moment
            </p>
            <p className={`text-sm mt-2 ${textSecondary}`}>
              Please check back later.
            </p>
          </motion.div>
        ) : (
          <>
            {/* ── Submit Form */}
            {!viewOnly && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mb-8"
              >
                {!showForm && submitStatus?.type === "success" ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`rounded-3xl border p-8 text-center ${cardBg} backdrop-blur`}
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                    >
                      <CheckCircle2
                        size={48}
                        className="mx-auto mb-4 text-emerald-400"
                      />
                    </motion.div>
                    <p className={`text-lg font-semibold ${textPrimary}`}>
                      {submitStatus.message}
                    </p>
                    <button
                      onClick={() => {
                        setShowForm(true);
                        setSubmitStatus(null);
                      }}
                      className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition-all hover:scale-105 ${
                        darkMode
                          ? "border-stone-700 text-stone-300 hover:text-white"
                          : "border-stone-300 text-stone-600 hover:text-stone-900"
                      }`}
                    >
                      <MessageSquarePlus size={15} />
                      Write another review
                    </button>
                  </motion.div>
                ) : (
                  <div
                    className={`rounded-3xl border overflow-hidden ${cardBg} backdrop-blur`}
                    style={{
                      boxShadow: darkMode
                        ? "0 8px 40px rgba(0,0,0,0.4)"
                        : "0 8px 40px rgba(0,0,0,0.08)",
                    }}
                  >
                    {/* Form header */}
                    <div
                      className="px-6 pt-6 pb-4"
                      style={{
                        background: darkMode
                          ? "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(168,85,247,0.06))"
                          : "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(168,85,247,0.04))",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <MessageSquarePlus size={20} className="text-amber-400" />
                        <h2 className={`text-lg font-semibold ${textPrimary}`}>
                          Leave a Review
                        </h2>
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-5">
                      {/* Star rating */}
                      <div className="flex flex-col items-center py-4">
                        <p className={`text-xs uppercase tracking-widest font-bold mb-4 ${textSecondary}`}>
                          Your Rating
                        </p>
                        <StarPicker
                          value={rating}
                          onChange={setRating}
                          disabled={submitting}
                        />
                      </div>

                      {/* Name */}
                      <div>
                        <label
                          className={`block text-xs uppercase tracking-widest font-bold mb-2 ${textSecondary}`}
                        >
                          Your Name (optional)
                        </label>
                        <div className="relative">
                          <User
                            size={16}
                            className={`absolute left-3 top-1/2 -translate-y-1/2 ${textSecondary}`}
                          />
                          <input
                            type="text"
                            value={authorName}
                            onChange={(e) => setAuthorName(e.target.value)}
                            placeholder="Anonymous"
                            maxLength={100}
                            disabled={submitting}
                            className={`w-full pl-9 pr-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${inputBg} disabled:opacity-60`}
                          />
                        </div>
                      </div>

                      {/* Comment */}
                      <div>
                        <label
                          className={`block text-xs uppercase tracking-widest font-bold mb-2 ${textSecondary}`}
                        >
                          Your Review (optional)
                        </label>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Tell others about your experience..."
                          maxLength={1000}
                          rows={4}
                          disabled={submitting}
                          className={`w-full px-4 py-3 rounded-xl border text-sm resize-none transition-all focus:outline-none focus:ring-2 ${inputBg} disabled:opacity-60`}
                        />
                        <p className={`text-xs mt-1 text-right ${textSecondary}`}>
                          {comment.length}/1000
                        </p>
                      </div>

                      {/* Status message */}
                      <AnimatePresence>
                        {submitStatus && (
                          <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
                              submitStatus.type === "error"
                                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            }`}
                          >
                            {submitStatus.type === "error" ? (
                              <AlertCircle size={16} />
                            ) : (
                              <CheckCircle2 size={16} />
                            )}
                            {submitStatus.message}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={submitting || rating === 0}
                        className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                        style={{
                          background:
                            "linear-gradient(135deg, #f59e0b, #d97706)",
                          color: "white",
                          boxShadow: "0 4px 16px rgba(245,158,11,0.35)",
                        }}
                      >
                        {submitting ? (
                          <>
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            >
                              <Sparkles size={16} />
                            </motion.div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send size={16} />
                            Submit Review
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Reviews List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-lg font-semibold ${textPrimary}`}>
                  {reviews.length === 0
                    ? "No reviews yet"
                    : `${reviews.length} Review${reviews.length !== 1 ? "s" : ""}`}
                </h2>
                {viewOnly && (
                  <Link
                    to={`/${slug}/reviews`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all hover:scale-105"
                    style={{
                      background: "linear-gradient(135deg, #f59e0b, #d97706)",
                      color: "white",
                      boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
                    }}
                  >
                    <MessageSquarePlus size={15} />
                    Write a Review
                  </Link>
                )}
              </div>

              {reviews.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={`rounded-3xl border p-12 text-center ${cardBg} backdrop-blur`}
                >
                  <Star
                    size={48}
                    className={`mx-auto mb-4 ${textSecondary} opacity-30`}
                  />
                  <p className={`text-lg font-medium ${textPrimary}`}>
                    Be the first to review!
                  </p>
                  <p className={`text-sm mt-2 ${textSecondary}`}>
                    Share your experience and help others discover great food.
                  </p>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence>
                    {reviews.map((review, idx) => (
                      <motion.div
                        key={review.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className={`rounded-2xl border p-5 ${cardBg} backdrop-blur relative group`}
                        style={{
                          boxShadow: darkMode
                            ? "0 2px 16px rgba(0,0,0,0.3)"
                            : "0 2px 16px rgba(0,0,0,0.05)",
                        }}
                      >
                        {/* Admin delete button */}
                        {isAdminAuthenticated && (
                          <button
                            onClick={() => handleDelete(review.id)}
                            disabled={deletingId === review.id}
                            className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-lg text-stone-400 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-40"
                            aria-label="Delete review"
                            title="Delete review"
                          >
                            {deletingId === review.id ? (
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{
                                  duration: 1,
                                  repeat: Infinity,
                                  ease: "linear",
                                }}
                              >
                                <Sparkles size={16} />
                              </motion.div>
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        )}

                        {/* Review header */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                              style={{
                                background:
                                  "linear-gradient(135deg, #f59e0b, #a855f7)",
                                color: "white",
                              }}
                            >
                              {review.author_name
                                ? review.author_name[0].toUpperCase()
                                : "A"}
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${textPrimary}`}>
                                {review.author_name || "Anonymous"}
                              </p>
                              <StarDisplay rating={review.rating} size={13} />
                            </div>
                          </div>
                          <span
                            className={`text-xs flex-shrink-0 ${textSecondary}`}
                          >
                            {formatDate(review.created_at)}
                          </span>
                        </div>

                        {/* Comment */}
                        {review.comment && (
                          <p
                            className={`text-sm leading-relaxed ${textSecondary}`}
                          >
                            {review.comment}
                          </p>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <p className={`text-center text-[10px] uppercase tracking-widest mt-12 ${textSecondary} opacity-40`}>
          Powered by MenuQR
        </p>
      </div>
    </div>
  );
}
