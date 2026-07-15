import type { ApiErrorBody } from "../../shared/types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function readError(raw: string): string {
  if (!raw) return "Request failed.";
  try {
    const body = JSON.parse(raw) as Partial<ApiErrorBody> & { message?: unknown };
    const message = body.error || body.message;
    return typeof message === "string" && message.trim() ? message : raw;
  } catch {
    return raw;
  }
}

export async function request<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });
  const raw = await response.text();

  if (!response.ok) {
    throw new ApiClientError(
      readError(raw) || `Request failed (HTTP ${response.status}).`,
      response.status,
    );
  }

  if (!raw) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiClientError(
      `Server returned non-JSON (HTTP ${response.status}).`,
      response.status,
    );
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function jsonRequest<T>(
  input: RequestInfo | URL,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  init: RequestInit = {},
) {
  return request<T>(input, {
    ...init,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export { ApiClientError as ApiError };
export const apiRequest = request;

function filenameFromContentDisposition(value: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(
    /filename\*=UTF-8''([^;]+)|filename="([^"]+)"|filename=([^;]+)/i,
  );
  const filename = match?.[1] || match?.[2] || match?.[3];
  if (!filename) return undefined;
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

export async function downloadRequest(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<{ blob: Blob; filename?: string }> {
  const response = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new ApiClientError(
      readError(raw) || "Download failed.",
      response.status,
    );
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(
      response.headers.get("Content-Disposition"),
    ),
  };
}