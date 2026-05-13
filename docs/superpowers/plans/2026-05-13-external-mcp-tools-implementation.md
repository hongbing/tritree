# External MCP Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Tritree's existing Mastra writer and editor agents call tools from administrator-configured external MCP servers.

**Architecture:** Add a focused server-side MCP runtime module that reads `.tritree/mcp.json` or `TRITREE_MCP_CONFIG_PATH`, validates and redacts config, creates an `@mastra/mcp` client, flattens MCP toolsets into Mastra `ToolsInput`, and returns a cleanup function. Wire that runtime into `executionContextForDirectorParts` so MCP tools merge with existing Skill runtime tools and are disconnected after each AI execution.

**Tech Stack:** Next.js 16 server code, TypeScript, Vitest, Mastra Agent tools, `@mastra/mcp` `MCPClient`, Node `fs`/`path`/`crypto`.

---

## File Structure

- Create `src/lib/ai/mcp-runtime.ts`: MCP config path resolution, JSON parsing, validation, environment placeholder expansion, redaction, MCP client creation, toolset flattening, tool summaries, and disconnect handling.
- Create `src/lib/ai/mcp-runtime.test.ts`: parser tests, redaction tests, tool loading tests, collision tests, and disconnect tests with injected fake clients.
- Modify `src/lib/ai/mastra-executor.ts`: call `createMcpRuntimeTools()` after `createSkillRuntimeTools()`, merge returned tools and summaries, and disconnect runtime clients with `try/finally`.
- Modify `src/lib/ai/mastra-executor.test.ts`: mock MCP runtime, verify agent tools and prompt summaries, verify fake-agent paths skip runtime tools, and verify cleanup on success and failure.
- Modify `.env.example`: add commented `TRITREE_MCP_CONFIG_PATH`.
- Modify `README.md`: document external MCP config, examples, and security notes.

## Task 1: Parse And Validate MCP Config

**Files:**
- Create: `src/lib/ai/mcp-runtime.ts`
- Create: `src/lib/ai/mcp-runtime.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `src/lib/ai/mcp-runtime.test.ts`:

```ts
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
```

- [ ] **Step 2: Run parser tests to verify they fail**

Run:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts
```

Expected: FAIL because `src/lib/ai/mcp-runtime.ts` does not exist yet.

- [ ] **Step 3: Implement config parsing**

Create `src/lib/ai/mcp-runtime.ts`:

```ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MCPClient, type MastraMCPServerDefinition } from "@mastra/mcp";
import type { ToolsInput } from "@mastra/core/agent";

type StringEnv = Record<string, string | undefined>;

export type McpRuntimeTools = {
  diagnostics: string[];
  disconnect: () => Promise<void>;
  toolSummaries: string[];
  tools: ToolsInput;
};

type McpClientLike = {
  disconnect?: () => Promise<void>;
  listToolsetsWithErrors?: () => Promise<{
    errors: Record<string, string>;
    toolsets: Record<string, ToolsInput>;
  }>;
  listTools?: () => Promise<ToolsInput>;
};

type McpRuntimeOptions = {
  configPath?: string;
  cwd?: string;
  env?: StringEnv;
  existingTools?: ToolsInput;
  createClient?: (options: { id: string; servers: Record<string, MastraMCPServerDefinition> }) => McpClientLike;
  log?: (message: string) => void;
};

type LoadServerDefinitionsOptions = {
  configPath: string;
  env?: StringEnv;
  exists?: (filePath: string) => boolean;
  readFile?: (filePath: string) => string;
};

type LoadServerDefinitionsResult = {
  configHash: string;
  diagnostics: string[];
  servers: Record<string, MastraMCPServerDefinition>;
};

const SERVER_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const ENV_PLACEHOLDER_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const STDIO_KEYS = new Set(["args", "command", "cwd", "disabled", "env", "roots", "timeout"]);
const HTTP_KEYS = new Set(["connectTimeout", "disabled", "requestInit", "roots", "timeout", "url"]);

export function defaultMcpConfigPath(cwd = process.cwd()) {
  return path.join(cwd, ".tritree", "mcp.json");
}

export function resolveMcpConfigPath({
  cwd = process.cwd(),
  env = process.env
}: {
  cwd?: string;
  env?: StringEnv;
} = {}) {
  const configuredPath = env.TRITREE_MCP_CONFIG_PATH?.trim();
  if (!configuredPath) return defaultMcpConfigPath(cwd);
  if (!path.isAbsolute(configuredPath)) {
    throw new Error("TRITREE_MCP_CONFIG_PATH must be an absolute path.");
  }
  return configuredPath;
}

export function loadMcpServerDefinitions({
  configPath,
  env = process.env,
  exists = existsSync,
  readFile = (filePath) => readFileSync(filePath, "utf8")
}: LoadServerDefinitionsOptions): LoadServerDefinitionsResult {
  if (!exists(configPath)) {
    return { configHash: "", diagnostics: [], servers: {} };
  }

  let rawConfig: unknown;
  const configText = readFile(configPath);
  try {
    rawConfig = JSON.parse(configText);
  } catch (error) {
    return {
      configHash: hashConfig(configText),
      diagnostics: [`MCP config ${configPath} is not valid JSON: ${redactMcpDiagnostic(errorMessage(error))}`],
      servers: {}
    };
  }

  if (!isRecord(rawConfig)) {
    return {
      configHash: hashConfig(configText),
      diagnostics: [`MCP config ${configPath} must be a JSON object.`],
      servers: {}
    };
  }

  const mcpServers = rawConfig.mcpServers;
  if (mcpServers === undefined) {
    return { configHash: hashConfig(configText), diagnostics: [], servers: {} };
  }
  if (!isRecord(mcpServers)) {
    return {
      configHash: hashConfig(configText),
      diagnostics: ["MCP config mcpServers must be an object."],
      servers: {}
    };
  }

  const diagnostics: string[] = [];
  const servers: Record<string, MastraMCPServerDefinition> = {};
  for (const [serverName, rawServer] of Object.entries(mcpServers)) {
    const parsed = parseServerDefinition(serverName, rawServer, env);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.server) servers[serverName] = parsed.server;
  }

  return {
    configHash: hashConfig(configText),
    diagnostics,
    servers
  };
}

function parseServerDefinition(
  serverName: string,
  rawServer: unknown,
  env: StringEnv
): { diagnostics: string[]; server?: MastraMCPServerDefinition } {
  if (!SERVER_NAME_PATTERN.test(serverName)) {
    return { diagnostics: [`MCP server ${serverName} has an invalid name.`] };
  }
  if (!isRecord(rawServer)) {
    return { diagnostics: [`MCP server ${serverName} must be an object.`] };
  }
  if (rawServer.disabled === true) {
    return { diagnostics: [] };
  }

  const hasCommand = typeof rawServer.command === "string";
  const hasUrl = typeof rawServer.url === "string";
  if (hasCommand === hasUrl) {
    return { diagnostics: [`MCP server ${serverName} must define exactly one of command or url.`] };
  }

  return hasCommand
    ? parseStdioServerDefinition(serverName, rawServer, env)
    : parseHttpServerDefinition(serverName, rawServer, env);
}

function parseStdioServerDefinition(
  serverName: string,
  rawServer: Record<string, unknown>,
  env: StringEnv
): { diagnostics: string[]; server?: MastraMCPServerDefinition } {
  const diagnostics = unknownKeyDiagnostics(serverName, rawServer, STDIO_KEYS);
  const command = expandString(rawServer.command as string, env);
  if (!command.value.trim()) diagnostics.push(`MCP server ${serverName} command must not be empty.`);
  diagnostics.push(...command.diagnostics.map((message) => `MCP server ${serverName}: ${message}`));

  const args = readStringArray(rawServer.args, `MCP server ${serverName} args`, env, diagnostics);
  const serverEnv = readStringMap(rawServer.env, `MCP server ${serverName} env`, env, diagnostics);
  const cwd = readOptionalAbsolutePath(rawServer.cwd, `MCP server ${serverName} cwd`, diagnostics);
  const timeout = readOptionalTimeout(rawServer.timeout, `MCP server ${serverName} timeout`, diagnostics);
  const roots = readRoots(rawServer.roots, `MCP server ${serverName} roots`, diagnostics);
  if (diagnostics.length > 0) return { diagnostics };

  return {
    diagnostics: [],
    server: {
      command: command.value,
      ...(args ? { args } : {}),
      ...(cwd ? { cwd } : {}),
      ...(serverEnv ? { env: serverEnv } : {}),
      ...(roots ? { roots } : {}),
      ...(timeout ? { timeout } : {})
    }
  };
}

function parseHttpServerDefinition(
  serverName: string,
  rawServer: Record<string, unknown>,
  env: StringEnv
): { diagnostics: string[]; server?: MastraMCPServerDefinition } {
  const diagnostics = unknownKeyDiagnostics(serverName, rawServer, HTTP_KEYS);
  const rawUrl = expandString(String(rawServer.url), env);
  diagnostics.push(...rawUrl.diagnostics.map((message) => `MCP server ${serverName}: ${message}`));

  let url: URL | undefined;
  try {
    url = new URL(rawUrl.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      diagnostics.push(`MCP server ${serverName} url must use http or https.`);
    }
  } catch {
    diagnostics.push(`MCP server ${serverName} url must be an absolute URL.`);
  }

  const requestInit = readRequestInit(rawServer.requestInit, `MCP server ${serverName} requestInit`, env, diagnostics);
  const timeout = readOptionalTimeout(rawServer.timeout, `MCP server ${serverName} timeout`, diagnostics);
  const connectTimeout = readOptionalTimeout(
    rawServer.connectTimeout,
    `MCP server ${serverName} connectTimeout`,
    diagnostics
  );
  const roots = readRoots(rawServer.roots, `MCP server ${serverName} roots`, diagnostics);
  if (diagnostics.length > 0 || !url) return { diagnostics };

  return {
    diagnostics: [],
    server: {
      url,
      ...(connectTimeout ? { connectTimeout } : {}),
      ...(requestInit ? { requestInit } : {}),
      ...(roots ? { roots } : {}),
      ...(timeout ? { timeout } : {})
    }
  };
}

function readStringArray(
  value: unknown,
  label: string,
  env: StringEnv,
  diagnostics: string[]
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    diagnostics.push(`${label} must be an array of strings.`);
    return undefined;
  }
  const expanded: string[] = [];
  for (const item of value) {
    const result = expandString(item, env);
    diagnostics.push(...result.diagnostics.map((message) => `${label}: ${message}`));
    expanded.push(result.value);
  }
  return expanded;
}

function readStringMap(
  value: unknown,
  label: string,
  env: StringEnv,
  diagnostics: string[]
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "string")) {
    diagnostics.push(`${label} must be a string map.`);
    return undefined;
  }
  const expanded: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const result = expandString(item as string, env);
    diagnostics.push(...result.diagnostics.map((message) => `${label}.${key}: ${message}`));
    expanded[key] = result.value;
  }
  return expanded;
}

function readRequestInit(
  value: unknown,
  label: string,
  env: StringEnv,
  diagnostics: string[]
): { headers?: Record<string, string> } | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push(`${label} must be an object.`);
    return undefined;
  }
  const unknownKeys = Object.keys(value).filter((key) => key !== "headers");
  for (const key of unknownKeys) diagnostics.push(`${label} has unsupported key ${key}.`);
  const headers = readStringMap(value.headers, `${label}.headers`, env, diagnostics);
  return headers ? { headers } : {};
}

function readOptionalAbsolutePath(value: unknown, label: string, diagnostics: string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    diagnostics.push(`${label} must be an absolute path.`);
    return undefined;
  }
  return value;
}

function readOptionalTimeout(value: unknown, label: string, diagnostics: string[]) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    diagnostics.push(`${label} must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
    return undefined;
  }
  return value as number;
}

function readRoots(
  value: unknown,
  label: string,
  diagnostics: string[]
): Array<{ uri: string; name?: string }> | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push(`${label} must be an array.`);
    return undefined;
  }
  const roots: Array<{ uri: string; name?: string }> = [];
  for (const [index, root] of value.entries()) {
    if (!isRecord(root) || typeof root.uri !== "string") {
      diagnostics.push(`${label}[${index}] must include a file URI.`);
      continue;
    }
    if (!root.uri.startsWith("file://")) {
      diagnostics.push(`${label}[${index}].uri must be a file:// URI.`);
      continue;
    }
    if (root.name !== undefined && typeof root.name !== "string") {
      diagnostics.push(`${label}[${index}].name must be a string.`);
      continue;
    }
    roots.push({ uri: root.uri, ...(root.name ? { name: root.name } : {}) });
  }
  return roots;
}

function expandString(value: string, env: StringEnv) {
  const diagnostics: string[] = [];
  const expanded = value.replace(ENV_PLACEHOLDER_PATTERN, (_match, name: string) => {
    const envValue = env[name];
    if (!envValue) {
      diagnostics.push(`${name} is not configured`);
      return "";
    }
    return envValue;
  });
  return { diagnostics, value: expanded };
}

function unknownKeyDiagnostics(serverName: string, value: Record<string, unknown>, allowedKeys: Set<string>) {
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .map((key) => `MCP server ${serverName} has unsupported key ${key}.`);
}

function hashConfig(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function redactMcpDiagnostic(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(API_KEY|TOKEN|PASSWORD|SECRET)=([^\s,}]+)/gi, "$1=[redacted]")
    .replace(/\b(api[_-]?key|token|password|secret)=([^\s,}]+)/gi, "$1=[redacted]");
}

export async function createMcpRuntimeTools(_options: McpRuntimeOptions = {}): Promise<McpRuntimeTools> {
  return {
    diagnostics: [],
    disconnect: async () => undefined,
    toolSummaries: [],
    tools: {}
  };
}

export { DEFAULT_TIMEOUT_MS };
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts
```

Expected: PASS for the parser tests added in Step 1.

- [ ] **Step 5: Commit parser layer**

Run:

```bash
git add src/lib/ai/mcp-runtime.ts src/lib/ai/mcp-runtime.test.ts
git commit -m "feat: parse mcp runtime config"
```

Expected: commit succeeds.

## Task 2: Load MCP Tools And Produce Safe Summaries

**Files:**
- Modify: `src/lib/ai/mcp-runtime.ts`
- Modify: `src/lib/ai/mcp-runtime.test.ts`

- [ ] **Step 1: Add failing MCP client tests**

First update the existing import from `./mcp-runtime` so it also imports `createMcpRuntimeTools`:

```ts
import {
  createMcpRuntimeTools,
  defaultMcpConfigPath,
  loadMcpServerDefinitions,
  redactMcpDiagnostic,
  resolveMcpConfigPath
} from "./mcp-runtime";
```

Then append these tests inside `src/lib/ai/mcp-runtime.test.ts`:

```ts

describe("MCP runtime tool loading", () => {
  it("loads toolsets, namespaces tools by server, and summarizes safe tool names", async () => {
    const dir = makeTempDir();
    const configPath = writeJsonConfig(dir, {
      mcpServers: {
        filesystem: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/allowed"]
        },
        search: {
          url: "https://mcp.example.com/mcp"
        }
      }
    });
    const readFile = { id: "read_file", description: "Read an allowed file.", execute: async () => ({}) };
    const searchWeb = { id: "search_web", description: "Search public web results.", execute: async () => ({}) };
    const disconnect = vi.fn(async () => undefined);
    const createClient = vi.fn(() => ({
      disconnect,
      listToolsetsWithErrors: vi.fn(async () => ({
        errors: {},
        toolsets: {
          filesystem: { read_file: readFile },
          search: { search_web: searchWeb }
        }
      }))
    }));

    const result = await createMcpRuntimeTools({
      configPath,
      createClient,
      env: {}
    });

    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^tritree-mcp-/),
        servers: expect.objectContaining({
          filesystem: expect.objectContaining({ command: "npx" }),
          search: expect.objectContaining({ url: expect.any(URL) })
        })
      })
    );
    expect(result.tools).toEqual({
      filesystem_read_file: readFile,
      search_search_web: searchWeb
    });
    expect(result.toolSummaries.join("\n")).toContain("MCP filesystem");
    expect(result.toolSummaries.join("\n")).toContain("filesystem_read_file");
    expect(result.toolSummaries.join("\n")).toContain("MCP search");
    expect(result.toolSummaries.join("\n")).toContain("search_search_web");
    await result.disconnect();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps existing tools when a namespaced MCP tool collides", async () => {
    const dir = makeTempDir();
    const configPath = writeJsonConfig(dir, {
      mcpServers: {
        filesystem: {
          command: "node",
          args: ["server.js"]
        }
      }
    });
    const localTool = { id: "filesystem_read_file", description: "Local tool", execute: async () => ({}) };
    const mcpTool = { id: "read_file", description: "MCP tool", execute: async () => ({}) };
    const result = await createMcpRuntimeTools({
      configPath,
      createClient: () => ({
        disconnect: async () => undefined,
        listToolsetsWithErrors: async () => ({
          errors: {},
          toolsets: { filesystem: { read_file: mcpTool } }
        })
      }),
      env: {},
      existingTools: { filesystem_read_file: localTool }
    });

    expect(result.tools).toEqual({});
    expect(result.toolSummaries.join("\n")).toContain("skipped filesystem_read_file");
  });

  it("reports per-server list errors without exposing configured secrets", async () => {
    const dir = makeTempDir();
    const configPath = writeJsonConfig(dir, {
      mcpServers: {
        search: {
          url: "https://mcp.example.com/mcp",
          requestInit: {
            headers: {
              Authorization: "Bearer ${REMOTE_SEARCH_MCP_TOKEN}"
            }
          }
        }
      }
    });
    const result = await createMcpRuntimeTools({
      configPath,
      createClient: () => ({
        disconnect: async () => undefined,
        listToolsetsWithErrors: async () => ({
          errors: { search: "Authorization: Bearer remote-secret failed" },
          toolsets: {}
        })
      }),
      env: { REMOTE_SEARCH_MCP_TOKEN: "remote-secret" }
    });

    expect(result.tools).toEqual({});
    expect(result.toolSummaries.join("\n")).toContain("MCP search unavailable");
    expect(result.toolSummaries.join("\n")).toContain("Bearer [redacted]");
    expect(result.toolSummaries.join("\n")).not.toContain("remote-secret");
  });

  it("returns no tools when config path is relative or config is invalid", async () => {
    const log = vi.fn();
    const result = await createMcpRuntimeTools({
      cwd: "/workspace/tritree",
      env: { TRITREE_MCP_CONFIG_PATH: "relative/mcp.json" },
      log
    });

    expect(result.tools).toEqual({});
    expect(result.toolSummaries.join("\n")).toContain("TRITREE_MCP_CONFIG_PATH must be an absolute path");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("TRITREE_MCP_CONFIG_PATH must be an absolute path"));
  });
});
```

- [ ] **Step 2: Run MCP client tests to verify they fail**

Run:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts
```

Expected: FAIL because `createMcpRuntimeTools()` still returns an empty result.

- [ ] **Step 3: Implement MCP tool loading**

Replace the stubbed `createMcpRuntimeTools()` in `src/lib/ai/mcp-runtime.ts` and add helper functions below `redactMcpDiagnostic`:

```ts
export async function createMcpRuntimeTools(options: McpRuntimeOptions = {}): Promise<McpRuntimeTools> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((message: string) => console.warn(message));
  let configPath: string;
  try {
    configPath = options.configPath ?? resolveMcpConfigPath({ cwd: options.cwd, env });
  } catch (error) {
    const diagnostic = redactMcpDiagnostic(errorMessage(error));
    log(`[tritree:mcp] ${diagnostic}`);
    return emptyMcpRuntimeTools([diagnostic]);
  }

  const loaded = loadMcpServerDefinitions({ configPath, env });
  for (const diagnostic of loaded.diagnostics) {
    log(`[tritree:mcp] ${redactMcpDiagnostic(diagnostic)}`);
  }

  if (Object.keys(loaded.servers).length === 0) {
    return emptyMcpRuntimeTools(loaded.diagnostics);
  }

  const createClient =
    options.createClient ??
    ((clientOptions: { id: string; servers: Record<string, MastraMCPServerDefinition> }) =>
      new MCPClient(clientOptions));
  const client = createClient({
    id: `tritree-mcp-${loaded.configHash}`,
    servers: loaded.servers
  });

  try {
    const { errors, toolsets } = await listMcpToolsets(client);
    const flattened = flattenMcpToolsets(toolsets, options.existingTools ?? {});
    const toolSummaries = [
      ...summarizeMcpToolsets(toolsets, flattened.acceptedToolNamesByServer),
      ...Object.entries(errors).map(
        ([serverName, message]) => `MCP ${serverName} unavailable：${redactMcpDiagnostic(message)}`
      ),
      ...flattened.diagnostics
    ];

    return {
      diagnostics: [...loaded.diagnostics, ...Object.values(errors), ...flattened.diagnostics],
      disconnect: async () => {
        await client.disconnect?.();
      },
      toolSummaries,
      tools: flattened.tools
    };
  } catch (error) {
    const diagnostic = `MCP tools unavailable: ${redactMcpDiagnostic(errorMessage(error))}`;
    log(`[tritree:mcp] ${diagnostic}`);
    await client.disconnect?.();
    return emptyMcpRuntimeTools([...loaded.diagnostics, diagnostic]);
  }
}

async function listMcpToolsets(client: McpClientLike) {
  if (client.listToolsetsWithErrors) {
    return client.listToolsetsWithErrors();
  }
  const tools = client.listTools ? await client.listTools() : {};
  return {
    errors: {},
    toolsets: { mcp: tools }
  };
}

function flattenMcpToolsets(toolsets: Record<string, ToolsInput>, existingTools: ToolsInput) {
  const acceptedToolNamesByServer: Record<string, string[]> = {};
  const diagnostics: string[] = [];
  const tools: ToolsInput = {};

  for (const [serverName, serverTools] of Object.entries(toolsets)) {
    for (const [toolName, tool] of Object.entries(serverTools)) {
      const namespacedToolName = `${serverName}_${toolName}`;
      if (existingTools[namespacedToolName] || tools[namespacedToolName]) {
        diagnostics.push(`MCP ${serverName} skipped ${namespacedToolName} because a local tool already uses that name.`);
        continue;
      }
      tools[namespacedToolName] = tool;
      acceptedToolNamesByServer[serverName] = [...(acceptedToolNamesByServer[serverName] ?? []), namespacedToolName];
    }
  }

  return { acceptedToolNamesByServer, diagnostics, tools };
}

function summarizeMcpToolsets(
  toolsets: Record<string, ToolsInput>,
  acceptedToolNamesByServer: Record<string, string[]>
) {
  return Object.entries(toolsets)
    .map(([serverName, serverTools]) => {
      const names = acceptedToolNamesByServer[serverName] ?? [];
      if (names.length === 0) return "";
      const descriptions = names.slice(0, 12).map((namespacedName) => {
        const rawName = namespacedName.slice(serverName.length + 1);
        const description = summarizeToolDescription(serverTools[rawName]);
        return description ? `${namespacedName}（${description}）` : namespacedName;
      });
      const suffix = names.length > 12 ? ` 等 ${names.length} 个工具` : "";
      return `MCP ${serverName}：可用工具 ${descriptions.join("、")}${suffix}。仅当本轮任务需要该 MCP 服务能力时调用。`;
    })
    .filter(Boolean);
}

function summarizeToolDescription(tool: unknown) {
  if (!isRecord(tool) || typeof tool.description !== "string") return "";
  return redactMcpDiagnostic(tool.description).replace(/\s+/g, " ").trim().slice(0, 120);
}

function emptyMcpRuntimeTools(diagnostics: string[] = []): McpRuntimeTools {
  return {
    diagnostics,
    disconnect: async () => undefined,
    toolSummaries: diagnostics.length > 0 ? diagnostics.map((message) => `MCP unavailable：${redactMcpDiagnostic(message)}`) : [],
    tools: {}
  };
}
```

- [ ] **Step 4: Run MCP runtime tests**

Run:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit MCP runtime tool loading**

Run:

```bash
git add src/lib/ai/mcp-runtime.ts src/lib/ai/mcp-runtime.test.ts
git commit -m "feat: load external mcp tools"
```

Expected: commit succeeds.

## Task 3: Wire MCP Tools Into Mastra Execution

**Files:**
- Modify: `src/lib/ai/mastra-executor.ts`
- Modify: `src/lib/ai/mastra-executor.test.ts`

- [ ] **Step 1: Add failing executor tests**

Modify the hoisted mocks and module mocks at the top of `src/lib/ai/mastra-executor.test.ts`:

```ts
const mocks = vi.hoisted(() => ({
  agentConstructor: vi.fn(),
  createAnthropic: vi.fn(),
  createMcpRuntimeTools: vi.fn(),
  createSkillRuntimeTools: vi.fn()
}));
```

Add this mock near the existing Skill runtime mock:

```ts
vi.mock("./mcp-runtime", () => ({
  createMcpRuntimeTools: mocks.createMcpRuntimeTools
}));
```

Add this default in `beforeEach()` after the Skill runtime default:

```ts
mocks.createMcpRuntimeTools.mockResolvedValue({ disconnect: vi.fn(), toolSummaries: [], tools: {} });
```

Append these tests inside the `tree director compatibility generators` describe block:

```ts
  it("merges configured MCP tools with Skill runtime tools for real agents", async () => {
    const runSkillCommand = {
      id: "run_skill_command",
      description: "Run an installed skill command.",
      execute: vi.fn()
    };
    const readFile = {
      id: "filesystem_read_file",
      description: "Read a configured file.",
      execute: vi.fn()
    };
    const finalObject = {
      roundIntent: "选择下一步",
      options: [
        { id: "a", label: "补具体场景", description: "加入真实场景。", impact: "让文章更具体。", kind: "explore" },
        { id: "b", label: "压缩表达", description: "删掉重复句子。", impact: "让文章更利落。", kind: "deepen" },
        { id: "c", label: "检查发布", description: "整理标题和话题。", impact: "让文章接近发布。", kind: "finish" }
      ],
    };

    mocks.createSkillRuntimeTools.mockResolvedValueOnce({
      availableSkillSummaries: [],
      enabledSkills,
      toolSummaries: ["run_skill_command：调用已安装 skill 的脚本命令。"],
      tools: { run_skill_command: runSkillCommand }
    });
    mocks.createMcpRuntimeTools.mockResolvedValueOnce({
      disconnect: vi.fn(),
      toolSummaries: ["MCP filesystem：可用工具 filesystem_read_file。"],
      tools: { filesystem_read_file: readFile }
    });
    mocks.agentConstructor.mockImplementationOnce(function Agent(options) {
      return {
        options,
        generate: vi.fn(async () => ({ object: finalObject })),
        stream: vi.fn()
      };
    });

    await generateTreeOptions({
      parts: directorParts,
      env: { KIMI_API_KEY: "token" }
    });

    expect(mocks.createMcpRuntimeTools).toHaveBeenCalledWith(
      expect.objectContaining({
        existingTools: { run_skill_command: runSkillCommand }
      })
    );
    expect(mocks.agentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          run_skill_command: runSkillCommand,
          filesystem_read_file: readFile
        }
      })
    );
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[treeable:mastra-prompt:options]",
      expect.stringContaining("MCP filesystem")
    );
  });

  it("disconnects MCP runtime tools after a successful real-agent run", async () => {
    const disconnect = vi.fn(async () => undefined);
    const finalObject = {
      roundIntent: "继续完善",
      draft: { title: "标题", body: "正文", hashtags: [], imagePrompt: "" },
    };

    mocks.createMcpRuntimeTools.mockResolvedValueOnce({
      disconnect,
      toolSummaries: ["MCP filesystem：可用工具 filesystem_read_file。"],
      tools: {
        filesystem_read_file: { id: "filesystem_read_file", description: "Read file", execute: vi.fn() }
      }
    });
    mocks.agentConstructor.mockImplementationOnce(function Agent(options) {
      return {
        options,
        generate: vi.fn(async () => ({ object: finalObject })),
        stream: vi.fn()
      };
    });

    await generateTreeDraft({
      parts: directorParts,
      env: { KIMI_API_KEY: "token" }
    });

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects MCP runtime tools when real-agent generation fails", async () => {
    const disconnect = vi.fn(async () => undefined);
    mocks.createMcpRuntimeTools.mockResolvedValueOnce({
      disconnect,
      toolSummaries: ["MCP filesystem：可用工具 filesystem_read_file。"],
      tools: {
        filesystem_read_file: { id: "filesystem_read_file", description: "Read file", execute: vi.fn() }
      }
    });
    mocks.agentConstructor.mockImplementationOnce(function Agent(options) {
      return {
        options,
        generate: vi.fn(async () => {
          throw new Error("model failed");
        }),
        stream: vi.fn()
      };
    });

    await expect(
      generateTreeDraft({
        parts: directorParts,
        env: { KIMI_API_KEY: "token" }
      })
    ).rejects.toThrow("model failed");

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not load MCP runtime tools for injected fake agents", async () => {
    const fakeAgent = {
      generate: vi.fn(async () => ({
        object: {
          roundIntent: "继续完善",
          draft: { title: "标题", body: "正文", hashtags: [], imagePrompt: "" },
        }
      }))
    };

    await generateTreeDraft({
      parts: directorParts,
      treeDraftAgent: fakeAgent
    });

    expect(mocks.createMcpRuntimeTools).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run executor tests to verify they fail**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts
```

Expected: FAIL because `mastra-executor.ts` does not import or call `createMcpRuntimeTools()` yet.

- [ ] **Step 3: Wire MCP runtime into execution context**

Modify imports in `src/lib/ai/mastra-executor.ts`:

```ts
import { createMcpRuntimeTools, type McpRuntimeTools } from "./mcp-runtime";
```

Change `executionContextForDirectorParts()` return shape and body:

```ts
async function executionContextForDirectorParts(
  parts: DirectorInputParts,
  target: "writer" | "editor",
  context: Partial<AgentExecutionContextOverride> = {},
  skipRuntimeTools = false
) {
  const baseContext = contextForDirectorParts(parts, target, context);
  if (skipRuntimeTools) {
    return {
      agentContext: baseContext,
      disconnect: async () => undefined,
      tools: undefined as ToolsInput | undefined
    };
  }

  const runtime = await createSkillRuntimeTools(baseContext.enabledSkills);
  const runtimeEnabledSkills = Array.isArray(runtime.enabledSkills) ? runtime.enabledSkills : baseContext.enabledSkills;
  const runtimeAvailableSkillSummaries = Array.isArray(runtime.availableSkillSummaries)
    ? runtime.availableSkillSummaries
    : [];
  const mcpRuntime = await createMcpRuntimeTools({ existingTools: runtime.tools });
  const tools = mergeRuntimeTools(runtime.tools, mcpRuntime.tools);

  return {
    agentContext: {
      ...baseContext,
      availableSkillSummaries: [
        ...(baseContext.availableSkillSummaries ?? []),
        ...runtimeAvailableSkillSummaries
      ],
      enabledSkills: runtimeEnabledSkills,
      toolSummaries: [...(baseContext.toolSummaries ?? []), ...runtime.toolSummaries, ...mcpRuntime.toolSummaries]
    },
    disconnect: () => disconnectRuntimeTools(mcpRuntime),
    tools
  };
}

function mergeRuntimeTools(skillTools: ToolsInput | undefined, mcpTools: ToolsInput | undefined): ToolsInput {
  return {
    ...(skillTools ?? {}),
    ...(mcpTools ?? {})
  };
}

async function disconnectRuntimeTools(runtime: Pick<McpRuntimeTools, "disconnect">) {
  try {
    await runtime.disconnect();
  } catch (error) {
    logTritreeAiDebug("mcp-runtime", "disconnect-failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

- [ ] **Step 4: Add `try/finally` cleanup to top-level execution functions**

For each of these functions in `src/lib/ai/mastra-executor.ts`, keep the current body but rename the destructured execution context and wrap the agent run in `try/finally`:

- `generateTreeDraft`
- `generateTreeNextStep`
- `streamTreeNextStep`
- `streamTreeDraft`
- `generateTreeOptions`
- `streamTreeOptions`

Use this pattern for `generateTreeDraft`:

```ts
  const executionContext = await executionContextForDirectorParts(parts, "writer", context, Boolean(treeDraftAgent));
  const { agentContext, tools } = executionContext;
  try {
    const messages = directorMessagesForParts(parts);
    logMastraPrompt("draft", agentContext, messages);
    const agent = treeDraftAgent ?? (createTreeDraftAgent(agentContext, env, tools) as unknown as TreeDraftAgentLike);
    const output = await withStructuredOutputRetries(messages, "draft", async (attemptMessages) => {
      let result: Awaited<ReturnType<TreeDraftAgentLike["generate"]>>;
      try {
        result = await agent.generate(attemptMessages, {
          abortSignal: signal,
          ...executionOptionsForTools(tools),
          memory: memory ?? memoryScopeForDirectorParts(parts),
          structuredOutput: structuredOutputForDirector(DirectorDraftOutputSchema, env, tools, "generate")
        });
      } catch (error) {
        return DirectorDraftOutputSchema.parse(recoverMastraStructuredOutputValidationValue(error));
      }

      return DirectorDraftOutputSchema.parse(unwrapMastraToolInput(result.object ?? result.output));
    });
    if (!suppressResponseLog) logAiResponse("draft", "generate", output);
    return output;
  } finally {
    await executionContext.disconnect();
  }
```

Apply the same shape to the other five functions without changing their existing generation, stream, retry, final-submit, or logging logic.

- [ ] **Step 5: Run executor tests**

Run:

```bash
npm test -- src/lib/ai/mastra-executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit executor wiring**

Run:

```bash
git add src/lib/ai/mastra-executor.ts src/lib/ai/mastra-executor.test.ts
git commit -m "feat: wire mcp tools into agents"
```

Expected: commit succeeds.

## Task 4: Document MCP Configuration

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.example`**

Append this commented line to `.env.example`:

```dotenv
# TRITREE_MCP_CONFIG_PATH=/absolute/path/to/mcp.json
```

- [ ] **Step 2: Update README environment notes**

In `README.md`, after the `TRITREE_SKILL_EXECUTION_MODE` bullet in the configuration section, add:

```md
- 可选外部 MCP 工具配置：默认读取 `.tritree/mcp.json`；也可以用 `TRITREE_MCP_CONFIG_PATH=/absolute/path/to/mcp.json` 指向其他配置文件。MCP server 在 Tritree 服务端运行，拥有配置授予它的文件、网络和环境变量权限。
```

- [ ] **Step 3: Add README MCP section**

After the "Skill 导入" section in `README.md`, add:

````md
## 外部 MCP 工具

Tritree 可以把外部 MCP server 暴露的工具接入现有写作和编辑 agent。没有配置文件时，行为保持不变。

默认配置路径：

```text
.tritree/mcp.json
```

stdio 示例：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/absolute/allowed/path"
      ]
    }
  }
}
```

HTTP 示例：

```json
{
  "mcpServers": {
    "remoteSearch": {
      "url": "https://mcp.example.com/mcp",
      "requestInit": {
        "headers": {
          "Authorization": "Bearer ${REMOTE_SEARCH_MCP_TOKEN}"
        }
      }
    }
  }
}
```

配置里的 `${NAME}` 会从 Tritree 服务端环境变量展开。建议对文件类 MCP server 使用绝对路径和最小必要授权目录；不要把 `.tritree/mcp.json` 提交到 Git。
````

- [ ] **Step 4: Run documentation-adjacent checks**

Run:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts src/lib/ai/mastra-executor.test.ts
npm run typecheck
```

Expected: both commands pass.

- [ ] **Step 5: Commit docs**

Run:

```bash
git add .env.example README.md
git commit -m "docs: explain external mcp config"
```

Expected: commit succeeds.

## Task 5: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run targeted MCP and executor tests**

Run:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts src/lib/ai/mastra-executor.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Inspect final git status**

Run:

```bash
git status --short
```

Expected: no uncommitted implementation or documentation changes remain.

## Self-Review

- Spec coverage: The plan covers local JSON config, default and override paths, stdio and HTTP transports, env placeholder expansion, validation, redaction, fail-soft behavior, tool summaries, merging with Skill tools, collision handling, cleanup, docs, and verification.
- Scope check: The plan only implements external MCP client tools. It does not add UI, database storage, per-user permissions, or Tritree-as-MCP-server behavior.
- Type consistency: The runtime exposes `createMcpRuntimeTools()`, `loadMcpServerDefinitions()`, `resolveMcpConfigPath()`, `defaultMcpConfigPath()`, and `redactMcpDiagnostic()`. Executor tests mock `createMcpRuntimeTools()` with the same return shape used by `mastra-executor.ts`.
