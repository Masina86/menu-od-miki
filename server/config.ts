import path from "node:path";

export interface AppConfig {
  dbPath: string;
  mediaDir: string;
  seedDbPath: string;
  seedMediaDir: string;
  port: number;
  isProduction: boolean;
  adminPassword: string;
  adminSessionSecret: string;
  geminiApiKey?: string;
  popularityTimeZone: string;
}

export function resolveDbPath(value = process.env.DB_PATH): string {
  const configured = value || path.join("data", "runtime", "menu.db");
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

export function resolveSeedDbPath(): string {
  return path.resolve(process.cwd(), "data", "seed", "menu.db");
}

export function resolveSeedMediaDir(): string {
  return path.resolve(process.cwd(), "data", "seed", "media");
}

export function resolveMediaDir(
  value = process.env.MEDIA_DIR,
  dbPath = resolveDbPath(),
): string {
  const configured = value || path.join(path.dirname(dbPath), "media");
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

export function loadConfig(env = process.env): AppConfig {
  const isProduction = env.NODE_ENV === "production";
  const adminPassword = env.ADMIN_PASSWORD || (isProduction ? "" : "admin");
  const configuredPort = Number(env.PORT || 3000);

  const dbPath = resolveDbPath(env.DB_PATH);
  return {
    dbPath,
    mediaDir: resolveMediaDir(env.MEDIA_DIR, dbPath),
    seedDbPath: resolveSeedDbPath(),
    seedMediaDir: resolveSeedMediaDir(),
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
