import { HttpError } from "./errors.js";

export function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new HttpError(400, `${field} is required.`);
  return text;
}

export function optionalText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function positiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new HttpError(400, `${field} must be a positive integer.`);
  }
  return number;
}

export function finiteNumber(
  value: unknown,
  field: string,
  minimum?: number,
  maximum?: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new HttpError(400, `${field} must be a number.`);
  }
  if (minimum !== undefined && number < minimum) {
    throw new HttpError(400, `${field} must be at least ${minimum}.`);
  }
  if (maximum !== undefined && number > maximum) {
    throw new HttpError(400, `${field} must be at most ${maximum}.`);
  }
  return number;
}

export function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function booleanFlag(value: unknown): 0 | 1 {
  return value === true || value === 1 || value === "1" ? 1 : 0;
}
