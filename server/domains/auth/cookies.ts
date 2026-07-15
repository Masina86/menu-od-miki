export function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rawValue] = part.trim().split("=");
    if (!name) continue;
    cookies[name] = decodeURIComponent(rawValue.join("=") || "");
  }
  return cookies;
}

export function sessionCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  secure: boolean,
) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
