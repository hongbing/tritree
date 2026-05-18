import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

function normalizeWebBasePath(value) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === "/") return "";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/u, "");
  return withoutTrailingSlash === "/" ? "" : withoutTrailingSlash;
}

const webBasePath = normalizeWebBasePath(process.env.TRITREE_WEB_BASE_PATH ?? process.env.NEXT_PUBLIC_TRITREE_WEB_BASE_PATH);
const appRootPath = normalizeWebBasePath(process.env.TRITREE_APP_ROOT_PATH ?? process.env.NEXT_PUBLIC_TRITREE_APP_ROOT_PATH);

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(webBasePath ? { basePath: webBasePath } : {}),
  env: {
    NEXT_PUBLIC_TRITREE_WEB_BASE_PATH: webBasePath,
    NEXT_PUBLIC_TRITREE_APP_ROOT_PATH: appRootPath
  },
  ...(appRootPath
    ? {
        async redirects() {
          return [
            {
              source: "/",
              destination: appRootPath,
              permanent: false
            }
          ];
        },
        async rewrites() {
          return [
            {
              source: appRootPath,
              destination: "/"
            },
            {
              source: `${appRootPath}/:path*`,
              destination: "/:path*"
            }
          ];
        }
      }
    : {}),
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot
  }
};

export default nextConfig;
