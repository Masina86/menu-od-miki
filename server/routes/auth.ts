import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  clearAdminCookie,
  createAdminSession,
  isAdminSessionValid,
  setAdminCookie,
  type AdminSessionConfig,
} from "../domains/auth/session.js";

interface AuthRouteOptions {
  password: string;
  sessionConfig: AdminSessionConfig;
}

export function registerAuthRoutes(
  app: Express,
  { password, sessionConfig }: AuthRouteOptions,
): void {
  app.post("/api/auth/login", (req: Request, res: Response) => {
    if (!password) {
      res.status(503).json({ error: "Admin login is not configured." });
      return;
    }

    const submitted = Buffer.from(String(req.body?.password || ""));
    const expected = Buffer.from(password);
    const isValid =
      submitted.length === expected.length &&
      crypto.timingSafeEqual(submitted, expected);

    if (!isValid) {
      res.status(401).json({ error: "Invalid password." });
      return;
    }

    setAdminCookie(res, sessionConfig, createAdminSession(sessionConfig));
    res.json({ authenticated: true });
  });

  app.post("/api/auth/logout", (_req, res) => {
    clearAdminCookie(res, sessionConfig);
    res.json({ authenticated: false });
  });

  app.get("/api/auth/session", (req, res) => {
    res.json({
      authenticated: isAdminSessionValid(req.headers.cookie, sessionConfig),
    });
  });
}
