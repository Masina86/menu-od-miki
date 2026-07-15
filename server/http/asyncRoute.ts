import type { NextFunction, Request, RequestHandler, Response } from "express";
import { HttpError, errorMessage } from "./errors.js";

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function apiErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500) console.error("[api] Unhandled request error:", error);
  res.status(status).json({
    error: errorMessage(
      error,
      status >= 500 ? "Internal server error." : "Request failed.",
    ),
  });
}
