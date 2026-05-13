# External MCP Tools Design

Date: 2026-05-13

## Summary

Tritree should let its existing writer and editor Mastra agents call externally configured MCP tools. This is a server-side runtime capability: administrators configure MCP servers in a local JSON file, Tritree loads those servers during AI execution, converts their tools through `@mastra/mcp`, and merges them with the current Skill runtime tools.

The first version should focus on external MCP client support. Tritree will not expose itself as an MCP server in this pass.

## Goals

- Let self-hosted Tritree instances connect to external MCP servers.
- Keep configuration local and explicit, with a format close to common MCP client configuration.
- Support stdio MCP servers such as `npx @modelcontextprotocol/server-filesystem`.
- Support HTTP MCP servers through URL-based configuration.
- Merge MCP tools into the existing Mastra Agent tool path without changing the user-facing creation flow.
- Add concise tool summaries to agent context so agents know which MCP capabilities exist.
- Fail softly when MCP configuration is missing or a server cannot load, so content generation is not blocked by one broken tool server.
- Avoid leaking secrets from `env` or request headers into prompts, logs, errors, or tests.

## Non-Goals

- Do not build a UI for MCP management.
- Do not store MCP settings in SQLite.
- Do not expose Tritree as an MCP server.
- Do not implement interactive user approval for each MCP tool call in this pass.
- Do not support arbitrary JavaScript hooks or dynamic fetch functions in JSON config.
- Do not make MCP tools available to browser/client code.

## User Experience

Administrators add a local MCP config file and restart the Tritree server. Regular users do not need to enable anything per session. When a configured MCP server exposes tools, the writer and editor agents can call those tools during draft generation, next-step routing, and option generation.

Default config path:

```text
.tritree/mcp.json
```

Override config path:

```env
TRITREE_MCP_CONFIG_PATH=/absolute/path/to/mcp.json
```

Example stdio config:

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

Example HTTP config:

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

Environment variable expansion is limited to exact `${NAME}` placeholders in configured string values. Missing placeholders should make that server unavailable with a redacted diagnostic.

## Config Contract

Create a new server-only MCP runtime module that parses this JSON shape:

```ts
type TritreeMcpConfig = {
  mcpServers?: Record<string, TritreeMcpServerConfig>;
};

type TritreeMcpServerConfig =
  | {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      timeout?: number;
      disabled?: boolean;
      roots?: Array<{ uri: string; name?: string }>;
    }
  | {
      url: string;
      requestInit?: {
        headers?: Record<string, string>;
      };
      timeout?: number;
      connectTimeout?: number;
      disabled?: boolean;
      roots?: Array<{ uri: string; name?: string }>;
    };
```

Validation rules:

- `mcpServers` may be absent or empty.
- Server names must be safe identifiers: letters, numbers, `_`, `-`, and `.`.
- Each enabled server must define either `command` or `url`, not both.
- `command` must be a non-empty string.
- `args` must be an array of strings when present.
- `env` and `requestInit.headers` must be string maps when present.
- `cwd`, when present, must be an absolute path.
- `url` must be an absolute `http:` or `https:` URL.
- `timeout` and `connectTimeout` must be positive bounded integers.
- `roots[].uri` must be a `file://` URI.
- Unknown top-level keys inside a server should be rejected to catch misspellings early.

The parser should convert HTTP `url` strings to `new URL(...)` before passing the server definition to `MCPClient`.

## Architecture

Recommended units:

- `src/lib/ai/mcp-runtime.ts`: load config, validate config, instantiate `MCPClient`, list MCP tools, produce safe tool summaries, and disconnect clients.
- `src/lib/ai/mcp-runtime.test.ts`: unit tests for config parsing, redaction, tool loading, and fail-soft behavior.
- `src/lib/ai/mastra-executor.ts`: merge MCP tools into `executionContextForDirectorParts`.
- `src/lib/ai/mastra-executor.test.ts`: verify MCP tools are passed to agents alongside Skill runtime tools.
- `.env.example` and `README.md`: document MCP setup.

`executionContextForDirectorParts` already gathers Skill runtime tools and tool summaries. Extend that flow:

1. Build the base agent context.
2. Load Skill runtime tools as today.
3. Load configured MCP runtime tools.
4. Merge Skill tools and MCP tools into one `ToolsInput`.
5. Append both Skill and MCP summaries to `toolSummaries`.
6. Pass merged tools to the existing agent constructors.

Injected fake agents in tests currently skip runtime tools. Keep that behavior so focused generator tests remain lightweight.

## Tool Naming

Mastra MCP tools may already be namespaced, but Tritree should not assume every upstream server avoids collisions with local tools.

Rules:

- Local Skill tools keep their current names.
- MCP tool names should be accepted as returned by `MCPClient.listTools()` when they do not collide.
- If an MCP tool name collides with an existing Skill or built-in tool, expose it as `${serverName}_${toolName}` when the original server can be identified.
- If a collision cannot be resolved deterministically, skip the MCP tool and include a redacted warning summary.

This keeps existing Skill behavior stable and makes collisions visible without breaking generation.

## MCP Client Lifecycle

Use `MCPClient` from `@mastra/mcp` with a stable id derived from the config file path and loaded config hash. The client should call `listTools()` to obtain Mastra-compatible tools.

Because stdio servers spawn subprocesses, the implementation must define a cleanup path:

- Expose a runtime result with an optional `disconnect` function.
- In each top-level generation or streaming function, disconnect after the agent run finishes.
- Use `try`/`finally` so disconnect happens on success, structured-output retry failure, stream failure, or abort.

If repeated creation proves too expensive, a later pass can cache clients more aggressively. The first implementation should prefer correctness and process cleanup over long-lived subprocess reuse.

## Prompting Rules

Add MCP summaries under the existing shared context section:

```text
# 可用工具和 MCP 能力
MCP filesystem：可用工具 read_file、list_directory。仅当本轮任务需要读取已授权路径内的文件时调用。
```

Summaries should include:

- Server name.
- Tool names.
- A short sanitized tool description when available.
- Load errors with secrets removed.

The existing agent instructions already say tools may be used only when listed. Keep that rule. Do not tell agents to assume external access when no MCP tools loaded.

## Error Handling

Missing config file is not an error. Invalid config should not crash user requests by default; instead, Tritree should:

- Skip MCP tools for that request.
- Add a concise redacted diagnostic to server logs.
- Add a safe tool summary only when it helps the agent avoid assuming missing tools.

Server connection or tool listing failure should be scoped to that server. One broken MCP server should not hide tools from other working MCP servers.

Redaction rules:

- Never include `env` values or header values in prompts.
- Replace likely secret values with `[redacted]`.
- Include variable names only when useful, for example `REMOTE_SEARCH_MCP_TOKEN is not configured`.
- Avoid stack traces in model-visible summaries.

## Security And Privacy

MCP servers can execute code, access network services, or read local files depending on their implementation. Tritree should treat MCP configuration as an administrator-only server-side feature.

First-version safeguards:

- Read config only from the server filesystem.
- Keep `.tritree/mcp.json` out of git by relying on the existing `.tritree/` ignored data directory.
- Require absolute paths for `cwd` and documented filesystem allow-list arguments.
- Pass explicit `env` values to stdio servers instead of assuming the full Tritree process environment is safe.
- Do not forward user browser cookies or NextAuth sessions to HTTP MCP servers.
- Restrict JSON HTTP config to static `requestInit.headers`; do not support executable `fetch` hooks.
- Do not display MCP config or secrets in the UI.

## Testing

Add focused Vitest coverage for:

- Missing `.tritree/mcp.json` returns no tools and no fatal error.
- `TRITREE_MCP_CONFIG_PATH` overrides the default path.
- Valid stdio config is converted into `MCPClient` server definitions with `command`, `args`, `env`, `cwd`, `timeout`, and `roots`.
- Valid HTTP config converts `url` strings to `URL` and passes static request headers.
- Disabled servers are skipped.
- Invalid server names, mixed `command` plus `url`, relative `cwd`, non-HTTP URLs, and unknown keys produce redacted diagnostics.
- Environment placeholder expansion fills configured values and reports missing values without exposing secrets.
- MCP tools are merged with existing Skill runtime tools.
- Tool summaries include server/tool names but not `env` or header values.
- Name collisions do not replace local Skill tools.
- MCP client disconnect runs after successful and failed agent executions.

Verification commands after implementation:

```bash
npm test -- src/lib/ai/mcp-runtime.test.ts src/lib/ai/mastra-executor.test.ts
npm run typecheck
```

## Documentation

Update README setup notes with:

- Default config path.
- `TRITREE_MCP_CONFIG_PATH`.
- Stdio example.
- HTTP example.
- Security note that MCP servers run with the permissions granted by their config.
- Reminder to use absolute filesystem paths for stdio servers, especially file access servers.

Update `.env.example` with a commented `TRITREE_MCP_CONFIG_PATH` example only. Do not add real secrets.

## Rollout

This change is server-side only. Existing Tritree behavior remains unchanged when no MCP config file exists. Users who do not configure MCP should see no UI changes and no additional setup requirements.

The implementation can land behind the natural "config file exists" gate. No database migration is needed.

## Open Follow-Ups

- Add an admin MCP settings page if users need runtime editing.
- Add per-user or per-session MCP permissions if multi-tenant deployments need different tool access.
- Add interactive approval for high-risk tools if Mastra approval support maps cleanly onto Tritree's UI.
- Consider a built-in health-check route for administrators to inspect configured MCP servers without starting a creative generation.
