import crypto from "node:crypto";
import type { Response } from "express";
import { parseCookies, sessionCookie } from "./cookies.js";

export interface AdminSessionConfig {
  cookieName: string;
  secret: string;
  maxAgeMs: number;
  secure: boolean;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAdminSession(config: AdminSessionConfig): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      exp: Date.now() + config.maxAgeMs,
    }),
  ).toString("base64url");
  return payload + "." + sign(payload, config.secret);
}

export function isAdminSessionValid(
  cookieHeader: string | undefined,
  config: AdminSessionConfig,
): boolean {
  const token = parseCookies(cookieHeader)[config.cookieName];
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload, config.secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      role?: unknown;
      exp?: unknown;
    };
    return session.role === "admin" && Number(session.exp) > Date.now();
  } catch {
    return false;
  }
}

export function setAdminCookie(
  response: Response,
  config: AdminSessionConfig,
  token: string,
): void {
  response.setHeader(
    "Set-Cookie",
    sessionCookie(
      config.cookieName,
      token,
      Math.floor(config.maxAgeMs / 1000),
      config.secure,
    ),
  );
}

export function clearAdminCookie(
  response: Response,
  config: AdminSessionConfig,
): void {
  response.setHeader(
    "Set-Cookie",
    sessionCookie(config.cookieName, "", 0, config.secure),
  );
}
