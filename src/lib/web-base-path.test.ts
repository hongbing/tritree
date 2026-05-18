import { afterEach, describe, expect, it, vi } from "vitest";
import { apiPath, appHomePath, appPath, getAppRootPath, normalizeWebBasePath } from "./web-base-path";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("web base path helpers", () => {
  it("normalizes empty and root prefixes to no base path", () => {
    expect(normalizeWebBasePath(undefined)).toBe("");
    expect(normalizeWebBasePath("")).toBe("");
    expect(normalizeWebBasePath("/")).toBe("");
  });

  it("normalizes custom path prefixes", () => {
    expect(normalizeWebBasePath("tritree")).toBe("/tritree");
    expect(normalizeWebBasePath("/tritree/")).toBe("/tritree");
  });

  it("prefixes app and API paths without double-prefixing", () => {
    vi.stubEnv("NEXT_PUBLIC_TRITREE_WEB_BASE_PATH", "/tritree");

    expect(appPath("/login")).toBe("/tritree/login");
    expect(appPath("/tritree/login")).toBe("/tritree/login");
    expect(apiPath("/api/sessions?view=active")).toBe("/tritree/api/sessions?view=active");
  });

  describe("getAppRootPath", () => {
    it("returns empty string when not configured", () => {
      expect(getAppRootPath()).toBe("");
    });

    it("reads from TRITREE_APP_ROOT_PATH", () => {
      vi.stubEnv("TRITREE_APP_ROOT_PATH", "/chat");
      expect(getAppRootPath()).toBe("/chat");
    });

    it("reads from NEXT_PUBLIC_TRITREE_APP_ROOT_PATH", () => {
      vi.stubEnv("NEXT_PUBLIC_TRITREE_APP_ROOT_PATH", "/chat");
      expect(getAppRootPath()).toBe("/chat");
    });

    it("NEXT_PUBLIC variant takes precedence over server-only variant", () => {
      vi.stubEnv("TRITREE_APP_ROOT_PATH", "/app");
      vi.stubEnv("NEXT_PUBLIC_TRITREE_APP_ROOT_PATH", "/chat");
      expect(getAppRootPath()).toBe("/chat");
    });

    it("normalizes the configured app root path", () => {
      vi.stubEnv("TRITREE_APP_ROOT_PATH", "chat/");
      expect(getAppRootPath()).toBe("/chat");
    });
  });

  describe("appHomePath", () => {
    it("returns '/' when app root path is not configured", () => {
      expect(appHomePath()).toBe("/");
    });

    it("returns the configured app root path", () => {
      vi.stubEnv("TRITREE_APP_ROOT_PATH", "/chat");
      expect(appHomePath()).toBe("/chat");
    });

    it("appends query string to the app root path", () => {
      vi.stubEnv("TRITREE_APP_ROOT_PATH", "/chat");
      expect(appHomePath("?new=1")).toBe("/chat?new=1");
    });

    it("appends query string when no app root path configured", () => {
      expect(appHomePath("?new=1")).toBe("/?new=1");
    });
  });
});
