import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultMcpConfigPath,
  loadMcpServerDefinitions,
  redactMcpDiagnostic,
  resolveMcpConfigPath
} from "./mcp-runtime";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "tritree-mcp-runtime-"));
  tempDirs.push(dir);
  return dir;
}

function writeJsonConfig(dir: string, value: unknown) {
  const filePath = path.join(dir, "mcp.json");
  writeFileSync(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("MCP runtime config parsing", () => {
  it("resolves the default MCP config path under .tritree", () => {
    expect(defaultMcpConfigPath("/workspace/tritree")).toBe("/workspace/tritree/.tritree/mcp.json");
    expect(resolveMcpConfigPath({ env: {}, cwd: "/workspace/tritree" })).toBe(
      "/workspace/tritree/.tritree/mcp.json"
    );
  });

  it("uses TRITREE_MCP_CONFIG_PATH when it is absolute", () => {
    expect(
      resolveMcpConfigPath({
        env: { TRITREE_MCP_CONFIG_PATH: "/secure/tritree/mcp.json" },
        cwd: "/workspace/tritree"
      })
    ).toBe("/secure/tritree/mcp.json");
  });

  it("returns no servers when the config file does not exist", () => {
    const dir = makeTempDir();
    const result = loadMcpServerDefinitions({
      configPath: path.join(dir, "missing.json"),
      env: {}
    });

    expect(result.servers).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  it("converts stdio and HTTP server configs into Mastra MCP definitions", () => {
    const dir = makeTempDir();
    const configPath = writeJsonConfig(dir, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/allowed"],
          cwd: "/tmp",
          env: {
            FILESYSTEM_TOKEN: "${FILESYSTEM_TOKEN}"
          },
          roots: [{ uri: "file:///tmp/allowed", name: "Allowed" }],
          timeout: 12000
        },
        remoteSearch: {
          url: "https://mcp.example.com/mcp",
          requestInit: {
            headers: {
              Authorization: "Bearer ${REMOTE_SEARCH_MCP_TOKEN}"
            }
          },
          connectTimeout: 2500
        },
        disabledServer: {
          disabled: true,
          command: "node",
          args: ["server.js"]
        }
      }
    });

    const result = loadMcpServerDefinitions({
      configPath,
      env: {
        FILESYSTEM_TOKEN: "fs-secret",
        REMOTE_SEARCH_MCP_TOKEN: "remote-secret"
      }
    });

    expect(result.diagnostics).toEqual([]);
    expect(Object.keys(result.servers)).toEqual(["filesystem", "remoteSearch"]);
    expect(result.servers.filesystem).toMatchObject({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/allowed"],
      cwd: "/tmp",
      env: { FILESYSTEM_TOKEN: "fs-secret" },
      roots: [{ uri: "file:///tmp/allowed", name: "Allowed" }],
      timeout: 12000
    });
    expect(result.servers.remoteSearch).toMatchObject({
      requestInit: {
        headers: {
          Authorization: "Bearer remote-secret"
        }
      },
      connectTimeout: 2500
    });
    expect(result.servers.remoteSearch && "url" in result.servers.remoteSearch ? result.servers.remoteSearch.url : null)
      .toBeInstanceOf(URL);
  });

  it("skips invalid servers with redacted diagnostics", () => {
    const dir = makeTempDir();
    const configPath = writeJsonConfig(dir, {
      mcpServers: {
        "bad/name": {
          command: "npx"
        },
        mixed: {
          command: "npx",
          url: "https://mcp.example.com/mcp"
        },
        relativeCwd: {
          command: "node",
          cwd: "relative"
        },
        ftpServer: {
          url: "ftp://example.com/mcp"
        },
        typoServer: {
          command: "node",
          argumentz: ["server.js"]
        },
        secretServer: {
          command: "node",
          env: {
            API_KEY: "${MISSING_API_KEY}"
          }
        }
      }
    });

    const result = loadMcpServerDefinitions({ configPath, env: {} });

    expect(result.servers).toEqual({});
    expect(result.diagnostics.join("\n")).toContain("bad/name");
    expect(result.diagnostics.join("\n")).toContain("mixed");
    expect(result.diagnostics.join("\n")).toContain("relativeCwd");
    expect(result.diagnostics.join("\n")).toContain("ftpServer");
    expect(result.diagnostics.join("\n")).toContain("argumentz");
    expect(result.diagnostics.join("\n")).toContain("MISSING_API_KEY is not configured");
    expect(result.diagnostics.join("\n")).not.toContain("API_KEY=");
  });

  it("redacts bearer tokens, API keys, passwords, and secrets from diagnostics", () => {
    expect(
      redactMcpDiagnostic(
        "Authorization: Bearer real-token API_KEY=abc123 password=hunter2 secret=topsecret"
      )
    ).toBe("Authorization: Bearer [redacted] API_KEY=[redacted] password=[redacted] secret=[redacted]");
  });
});

void vi;
