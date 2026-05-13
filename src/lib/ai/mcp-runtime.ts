import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ToolsInput } from "@mastra/core/agent";
import { MCPClient, type MastraMCPServerDefinition } from "@mastra/mcp";

type StringEnv = Record<string, string | undefined>;

export type McpRuntimeTools = {
  diagnostics: string[];
  disconnect: () => Promise<void>;
  toolSummaries: string[];
  tools: ToolsInput;
};

type McpRuntimeOptions = {
  configPath?: string;
  cwd?: string;
  env?: StringEnv;
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

  let configText: string;
  try {
    configText = readFile(configPath);
  } catch (error) {
    return {
      configHash: "",
      diagnostics: [`MCP config ${configPath} could not be read: ${redactMcpDiagnostic(errorMessage(error))}`],
      servers: {}
    };
  }

  let rawConfig: unknown;
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
    diagnostics.push(...parsed.diagnostics.map(redactMcpDiagnostic));
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
  const cwd = readOptionalAbsolutePath(rawServer.cwd, `MCP server ${serverName} cwd`, env, diagnostics);
  const timeout = readOptionalTimeout(rawServer.timeout, `MCP server ${serverName} timeout`, diagnostics);
  const roots = readRoots(rawServer.roots, `MCP server ${serverName} roots`, env, diagnostics);
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
  const roots = readRoots(rawServer.roots, `MCP server ${serverName} roots`, env, diagnostics);
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

function readOptionalAbsolutePath(value: unknown, label: string, env: StringEnv, diagnostics: string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    diagnostics.push(`${label} must be an absolute path.`);
    return undefined;
  }

  const expanded = expandString(value, env);
  diagnostics.push(...expanded.diagnostics.map((message) => `${label}: ${message}`));
  if (!path.isAbsolute(expanded.value)) {
    diagnostics.push(`${label} must be an absolute path.`);
    return undefined;
  }
  return expanded.value;
}

function readOptionalTimeout(value: unknown, label: string, diagnostics: string[]) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    diagnostics.push(`${label} must be an integer from 1 to ${MAX_TIMEOUT_MS}.`);
    return undefined;
  }
  return value;
}

function readRoots(
  value: unknown,
  label: string,
  env: StringEnv,
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
    const uri = expandString(root.uri, env);
    diagnostics.push(...uri.diagnostics.map((message) => `${label}[${index}].uri: ${message}`));
    if (!isValidFileUri(uri.value)) {
      diagnostics.push(`${label}[${index}].uri must be a file:// URI.`);
      continue;
    }
    if (root.name !== undefined && typeof root.name !== "string") {
      diagnostics.push(`${label}[${index}].name must be a string.`);
      continue;
    }

    const name = root.name === undefined ? undefined : expandString(root.name, env);
    if (name) diagnostics.push(...name.diagnostics.map((message) => `${label}[${index}].name: ${message}`));
    roots.push({ uri: uri.value, ...(name?.value ? { name: name.value } : {}) });
  }
  return roots;
}

function isValidFileUri(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "file:" && Boolean(url.pathname) && url.pathname !== "/";
  } catch {
    return false;
  }
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
  void MCPClient;

  return {
    diagnostics: [],
    disconnect: async () => undefined,
    toolSummaries: [],
    tools: {}
  };
}
