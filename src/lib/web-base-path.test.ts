import { afterEach, describe, expect, it, vi } from "vitest";
import { apiPath, appPath, normalizeWebBasePath } from "./web-base-path";

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
});
