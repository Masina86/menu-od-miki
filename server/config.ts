import path from "node:path";

export interface AppConfig {
  dbPath: string;
  port: number;
  isProduction: boolean;
  adminPassword: string;
  adminSessionSecret: string;
  geminiApiKey?: string;
  popularityTimeZone: string;
}

export function resolveDbPath(value = process.env.DB_PATH): string {
  const configured = value || "menu.db";
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

export function loadConfig(env = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";
  const adminPassword = env.ADMIN_PASSWORD || (isProduction ? "" : "admin");
  const configuredPort = Number(env.PORT || 3000);

  return {
    dbPath: resolveDbPath(env.DB_PATH),
    port:
      Number.isInteger(configuredPort) && configuredPort > 0
        ? configuredPort
        : 3000,
    isProduction,
    adminPassword,
    adminSessionSecret:
      env.ADMIN_SESSION_SECRET || adminPassword || "dev-admin-session-secret",
    geminiApiKey: env.GEMINI_API_KEY || undefined,
    popularityTimeZone: env.POPULARITY_TIME_ZONE || "Europe/Skopje",
  };
}
