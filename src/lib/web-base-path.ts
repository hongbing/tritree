function readConfiguredWebBasePath() {
  return process.env.NEXT_PUBLIC_TRITREE_WEB_BASE_PATH ?? process.env.TRITREE_WEB_BASE_PATH;
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
