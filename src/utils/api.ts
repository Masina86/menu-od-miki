export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const extractErrorMessage = (raw: string) => {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
    const message = parsed.error || parsed.message;
    return typeof message === "string" && message.trim() ? message : raw;
  } catch {
    return raw;
  }
};

export async function apiRequest<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, init);
  const raw = await res.text();

  if (!res.ok) {
    throw new ApiError(
      extractErrorMessage(raw) || `Request failed (HTTP ${res.status}).`,
      res.status,
    );
  }

  if (!raw) return undefined as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(
      `Server returned non-JSON (HTTP ${res.status}).`,
      res.status,
    );
  }
}

export const jsonRequest = <T>(
  input: RequestInfo | URL,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
  init?: RequestInit,
) =>
  apiRequest<T>(input, {
    ...init,
    method,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

