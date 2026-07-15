export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorMessage(error: unknown, fallback = "Request failed.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
