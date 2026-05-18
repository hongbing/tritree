function readConfiguredWebBasePath() {
  return process.env.NEXT_PUBLIC_TRITREE_WEB_BASE_PATH ?? process.env.TRITREE_WEB_BASE_PATH;
}

function readConfiguredAppRootPath() {
  return process.env.NEXT_PUBLIC_TRITREE_APP_ROOT_PATH ?? process.env.TRITREE_APP_ROOT_PATH;
}

export function normalizeWebBasePath(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "/") return "";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/u, "");
  return withoutTrailingSlash === "/" ? "" : withoutTrailingSlash;
}

export function getWebBasePath() {
  return normalizeWebBasePath(readConfiguredWebBasePath());
}

/**
 * Returns the app root path (e.g. "/chat") within the basePath.
 * When configured, the root "/" redirects to this path.
 * Returns "" when not configured (root "/" is the app entry point).
 */
export function getAppRootPath() {
  return normalizeWebBasePath(readConfiguredAppRootPath());
}

export function appPath(path: string) {
  const basePath = getWebBasePath();
  if (!basePath) return path;
  if (!path) return basePath;
  if (/^[a-z][a-z\d+.-]*:/iu.test(path) || path.startsWith("//")) return path;
  if (path === basePath || path.startsWith(`${basePath}/`)) return path;
  return path.startsWith("/") ? `${basePath}${path}` : `${basePath}/${path}`;
}

export function apiPath(path: string) {
  return appPath(path);
}

/**
 * Returns the app home path, combining appRootPath and an optional query string.
 * e.g. appHomePath() => "/chat", appHomePath("?new=1") => "/chat?new=1"
 * Falls back to "/" when appRootPath is not configured.
 */
export function appHomePath(query?: string) {
  const rootPath = getAppRootPath() || "/";
  return query ? `${rootPath}${query}` : rootPath;
}
