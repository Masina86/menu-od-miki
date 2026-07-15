import { HttpError } from "../../http/errors.js";
import { finiteNumber, optionalText, positiveInteger } from "../../http/validation.js";

export interface ReviewInput {
  restaurantId: number;
  authorName: string;
  rating: number;
  comment: string | null;
}

export function normalizeReviewInput(
  restaurantIdValue: unknown,
  body: Record<string, unknown>,
): ReviewInput {
  const restaurantId = positiveInteger(restaurantIdValue, "restaurantId");
  const rating = finiteNumber(body.rating, "Rating", 1, 5);
  const authorName = (optionalText(body.author_name) || "Anonymous").slice(0, 100);
  const comment = optionalText(body.comment)?.slice(0, 1000) || null;

  if (!Number.isInteger(rating)) {
    throw new HttpError(400, "Rating must be a whole number between 1 and 5.");
  }

  return { restaurantId, authorName, rating, comment };
}
