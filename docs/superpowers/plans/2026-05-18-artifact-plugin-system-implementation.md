# Artifact Plugin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tritree's draft-specific content model with a plugin-driven artifact system where workflow nodes may produce one artifact or no artifact.

**Architecture:** Tritree core owns sessions, workflow nodes, artifact records, plugin lookup, schema validation, streaming, and generic right-side workspace chrome. Concrete content types such as `social-post` and `prd` are local bundled artifact plugins that own payload schemas, AI instructions, renderer/editor/delivery surfaces, and plugin actions. This is a breaking change: old session content data can be discarded and there is no runtime compatibility for `Draft`, `currentDraft`, `nodeDrafts`, `publishPackage`, or `/draft` routes.

**Tech Stack:** Next.js App Router, React 19, TypeScript, SQLite `node:sqlite`, Zod, Vitest, Testing Library, CodeMirror.

---

## Scope Check

The design spans domain, persistence, AI, API, and UI, but these pieces are tightly coupled by the removal of `Draft` from `SessionState`. Execute tasks in order. Do not begin UI extraction until the generic domain, repository, and API tests are green.

## File Map

- `src/lib/domain.ts`: generic `ArtifactSchema`, `NodeArtifactSchema`, `TreeNodeSchema` workflow metadata, `SessionStateSchema` without draft fields.
- `src/artifacts/types.ts`: shared server/client plugin contracts and capability types.
- `src/artifacts/registry.ts`: server plugin registry with lookup, duplicate-id protection, and payload validation helpers.
- `src/artifacts/client-registry.tsx`: client manifest and renderer registry lookup.
- `src/artifacts/plugins/social-post/*`: social post payload schema, server plugin, client manifest, renderer/editor/diff/delivery components, selected-text action.
- `src/artifacts/plugins/prd/*`: PRD payload schema, server plugin, client manifest, renderer/editor/delivery components.
- `src/lib/db/client.ts`: breaking schema version, `artifacts` table, tree-node workflow columns, removal of draft/publish tables from new schema.
- `src/lib/db/schema.ts`: Drizzle mirror for new `artifacts` table and tree-node workflow columns.
- `src/lib/db/repository.ts`: artifact create/update/read methods, node completion without artifact, session summaries based on artifact summaries.
- `src/lib/app-state.ts`: artifact-aware director summaries and node focusing.
- `src/lib/ai/prompts.ts`, `src/lib/ai/director.ts`, `src/lib/ai/director-stream.ts`, `src/lib/ai/selection-rewrite.ts`: artifact output schemas, plugin action inputs, and generic stream helpers.
- `src/app/api/sessions/[sessionId]/artifact/*`: save, stream generate, and plugin action routes.
- `src/components/artifacts/*`: generic right-side `ArtifactWorkspace`, `ArtifactPanel`, and fallback renderer.
- `src/components/TreeableApp.tsx`: client state, stream parsing, artifact workspace wiring, node selection behavior.
- `src/app/globals.css`: rename draft-panel core styles to artifact workspace styles while plugin-local social-post styles keep social-post naming.
- Tests mirror each changed module.

## Execution Rules

- Write the failing test first for each task and verify the expected failure before production code.
- Commit after each task when tests pass.
- Keep `draft` as a core identifier out of new core files. The word can remain in plugin-local user-facing copy where it refers to social post drafting.
- Delete old `/draft` API files and `src/components/draft/LiveDraft.tsx`; do not leave wrapper aliases.

## Test Helper Snippets

Use these helpers in the test files that reference them. Place them near existing fixture helpers in each test file.

Domain helpers for `src/lib/domain.test.ts`:

```ts
function validRootMemory() {
  return {
    id: "root-1",
    preferences: {
      artifactTypeId: "social-post",
      seed: "Seed",
      creationRequest: "",
      domains: ["Creation"],
      tones: ["Sincere"],
      styles: ["Opinion-driven"],
      personas: ["Practitioner"]
    },
    summary: "Seed",
    learnedSummary: "",
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z"
  };
}

function validSession() {
  return {
    artifactTypeId: "social-post",
    id: "session-1",
    title: "Session",
    status: "active",
    currentNodeId: null,
    createdAt: "2026-05-18T00:00:00.000Z",
    updatedAt: "2026-05-18T00:00:00.000Z"
  };
}
```

Artifact fixture helpers for component and app-state tests:

```ts
function socialPostArtifact(overrides: Partial<Artifact> & { body?: string; imagePrompt?: string; title?: string } = {}): Artifact {
  return {
    id: overrides.id ?? "artifact-social-1",
    type: "social-post",
    version: overrides.version ?? 1,
    payload: {
      title: overrides.title ?? "微博草稿",
      body: overrides.body ?? "微博正文",
      hashtags: ["#AI"],
      imagePrompt: overrides.imagePrompt ?? ""
    },
    sourceArtifactIds: overrides.sourceArtifactIds ?? [],
    createdByNodeId: overrides.createdByNodeId ?? "node-1",
    createdAt: overrides.createdAt ?? "2026-05-18T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-18T00:00:00.000Z"
  };
}

function prdArtifact(overrides: Partial<Artifact> & { markdown?: string; title?: string } = {}): Artifact {
  return {
    id: overrides.id ?? "artifact-prd-1",
    type: "prd",
    version: overrides.version ?? 1,
    payload: {
      title: overrides.title ?? "PRD",
      markdown: overrides.markdown ?? "## 背景\n默认背景。"
    },
    sourceArtifactIds: overrides.sourceArtifactIds ?? [],
    createdByNodeId: overrides.createdByNodeId ?? "node-1",
    createdAt: overrides.createdAt ?? "2026-05-18T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-18T00:00:00.000Z"
  };
}

function unknownArtifact(overrides: Partial<Artifact> & { payload?: unknown; type?: string } = {}): Artifact {
  return {
    id: overrides.id ?? "artifact-unknown-1",
    type: overrides.type ?? "unknown-type",
    version: overrides.version ?? 1,
    payload: overrides.payload ?? { value: 1 },
    sourceArtifactIds: overrides.sourceArtifactIds ?? [],
    createdByNodeId: overrides.createdByNodeId ?? "node-1",
    createdAt: overrides.createdAt ?? "2026-05-18T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-18T00:00:00.000Z"
  };
}

function artifactNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: overrides.id ?? "node-1",
    sessionId: overrides.sessionId ?? "session-1",
    parentId: overrides.parentId ?? null,
    parentOptionId: overrides.parentOptionId ?? null,
    kind: "artifact",
    producedArtifactId: overrides.producedArtifactId ?? "artifact-social-1",
    sourceArtifactIds: overrides.sourceArtifactIds ?? [],
    roundIndex: overrides.roundIndex ?? 1,
    roundIntent: overrides.roundIntent ?? "形成产物",
    options: overrides.options ?? [],
    selectedOptionId: overrides.selectedOptionId ?? null,
    foldedOptions: overrides.foldedOptions ?? [],
    agentMessages: overrides.agentMessages ?? [],
    createdAt: overrides.createdAt ?? "2026-05-18T00:00:00.000Z"
  };
}

function analysisNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    ...artifactNode(overrides),
    kind: "analysis",
    producedArtifactId: null
  };
}

function artifactFromSocialPostPayload(payload: { body: string; hashtags: string[]; imagePrompt: string; title: string }): Artifact {
  return socialPostArtifact({ body: payload.body, imagePrompt: payload.imagePrompt, title: payload.title });
}

function artifactFromPrdPayload(payload: { markdown: string; title: string }): Artifact {
  return prdArtifact({ markdown: payload.markdown, title: payload.title });
}
```

Repository helpers for `src/lib/db/repository.test.ts`:

```ts
function createRepositoryHarness() {
  const dbPath = path.join(tmpdir(), `tritree-artifacts-${nanoid()}.sqlite`);
  const repo = createTreeableRepository(dbPath, { skillInstallRoot: path.join(tmpdir(), `skills-${nanoid()}`) });
  const user = repo.createUser({
    username: `user-${nanoid()}`,
    displayName: "Test User",
    password: "correct horse battery staple",
    role: "member"
  });
  return { dbPath, repo, user };
}

function createArtifactSessionHarness() {
  const harness = createRepositoryHarness();
  const root = harness.repo.saveRootMemory(harness.user.id, {
    preferences: {
      artifactTypeId: "social-post",
      seed: "写一条关于 AI 协作的微博",
      creationRequest: "",
      domains: ["Creation"],
      tones: ["Sincere"],
      styles: ["Opinion-driven"],
      personas: ["Practitioner"]
    },
    summary: "写一条关于 AI 协作的微博",
    learnedSummary: ""
  });
  const state = harness.repo.createSession({ userId: harness.user.id, rootMemoryId: root.id, enabledSkillIds: [] });
  return { ...harness, root, state };
}
```

API stream test mocks for `src/app/api/sessions/[sessionId]/artifact/generate/stream/route.test.ts`:

```ts
const mockStreamDirectorNextStep = vi.fn();
const mockStreamDirectorArtifact = vi.fn();

vi.mock("@/lib/ai/director-stream", () => ({
  streamDirectorNextStep: mockStreamDirectorNextStep,
  streamDirectorArtifact: mockStreamDirectorArtifact
}));
```

Treeable app test helpers for `src/components/TreeableApp.test.tsx`:

```ts
function createArtifactSessionState(overrides: Partial<SessionState> = {}): SessionState {
  const artifact = socialPostArtifact({ id: "artifact-1", createdByNodeId: "node-1", title: "微博" });
  const node = artifactNode({ id: "node-1", producedArtifactId: artifact.id });
  return {
    rootMemory: validRootMemory(),
    session: validSession(),
    currentNode: node,
    currentArtifact: artifact,
    artifacts: [artifact],
    nodeArtifacts: [{ nodeId: node.id, artifact }],
    selectedPath: [node],
    treeNodes: [node],
    enabledSkillIds: [],
    enabledSkills: [],
    foldedBranches: [],
    ...overrides
  };
}

function skillsResponse() {
  return { ok: true, json: async () => ({ skills: [], artifactTypes: [{ id: "social-post" }, { id: "prd" }] }) };
}

function rootMemoryResponse(rootMemory = validRootMemory()) {
  return { ok: true, json: async () => ({ rootMemory }) };
}

function sessionResponse(state: SessionState) {
  return { ok: true, json: async () => ({ state }) };
}

function streamResponse(events: unknown[]) {
  const body = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    }
  });
  return { body, ok: true };
}

async function chooseFirstOption() {
  await userEvent.click(await screen.findByRole("button", { name: /选择|继续|生成/ }));
}
```

### Task 1: Generic Domain And Artifact Plugin Contracts

**Files:**
- Create: `src/artifacts/types.ts`
- Create: `src/artifacts/registry.ts`
- Create: `src/artifacts/plugins/social-post/schema.ts`
- Create: `src/artifacts/plugins/social-post/server.ts`
- Create: `src/artifacts/plugins/prd/schema.ts`
- Create: `src/artifacts/plugins/prd/server.ts`
- Modify: `src/lib/domain.ts`
- Test: `src/lib/domain.test.ts`
- Test: `src/artifacts/registry.test.ts`
- Test: `src/artifacts/plugins/social-post/server.test.ts`
- Test: `src/artifacts/plugins/prd/server.test.ts`

- [ ] **Step 1: Add failing domain tests**

Add tests to `src/lib/domain.test.ts`:

```ts
describe("ArtifactSchema", () => {
  it("parses generic artifacts and node artifacts", () => {
    const artifact = ArtifactSchema.parse({
      id: "artifact-1",
      type: "social-post",
      version: 1,
      payload: { title: "T", body: "B", hashtags: [], imagePrompt: "" },
      sourceArtifactIds: ["artifact-0"],
      createdByNodeId: "node-1",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z"
    });

    expect(artifact.type).toBe("social-post");
    expect(NodeArtifactSchema.parse({ nodeId: "node-1", artifact }).artifact.id).toBe("artifact-1");
  });

  it("parses workflow nodes without produced artifacts", () => {
    const node = TreeNodeSchema.parse({
      id: "node-1",
      sessionId: "session-1",
      parentId: null,
      parentOptionId: null,
      kind: "analysis",
      producedArtifactId: null,
      sourceArtifactIds: [],
      roundIndex: 1,
      roundIntent: "只分析，不生成产物",
      options: [],
      selectedOptionId: null,
      foldedOptions: [],
      agentMessages: [],
      createdAt: "2026-05-18T00:00:00.000Z"
    });

    expect(node.producedArtifactId).toBeNull();
  });

  it("rejects legacy draft fields in session state", () => {
    const result = SessionStateSchema.safeParse({
      rootMemory: validRootMemory(),
      session: validSession(),
      currentNode: null,
      currentArtifact: null,
      artifacts: [],
      nodeArtifacts: [],
      selectedPath: [],
      enabledSkillIds: [],
      enabledSkills: [],
      foldedBranches: [],
      currentDraft: { title: "legacy", body: "legacy", hashtags: [], imagePrompt: "" },
      publishPackage: null
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Add failing registry and plugin tests**

Create `src/artifacts/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getArtifactPlugin, listArtifactPlugins, validateArtifactPayload } from "@/artifacts/registry";

describe("artifact plugin registry", () => {
  it("loads social-post and prd as plugins", () => {
    expect(listArtifactPlugins().map((plugin) => plugin.id)).toEqual(["social-post", "prd"]);
    expect(getArtifactPlugin("social-post")?.label).toBe("社媒内容");
    expect(getArtifactPlugin("prd")?.label).toBe("PRD 文档");
  });

  it("validates payloads with the owning plugin", () => {
    expect(validateArtifactPayload("social-post", { title: "T", body: "B", hashtags: [], imagePrompt: "" })).toEqual({
      title: "T",
      body: "B",
      hashtags: [],
      imagePrompt: ""
    });
    expect(() => validateArtifactPayload("prd", { title: "T", body: "B" })).toThrow("Invalid artifact payload");
  });
});
```

Create `src/artifacts/plugins/social-post/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { socialPostPlugin } from "@/artifacts/plugins/social-post/server";

describe("socialPostPlugin", () => {
  it("owns the current social post payload shape", () => {
    const payload = socialPostPlugin.normalizeAiOutput({
      title: "标题",
      body: "正文",
      hashtags: ["#AI"],
      imagePrompt: "白板"
    });

    expect(payload.body).toBe("正文");
    expect(socialPostPlugin.summarizeForDirector(payload)).toContain("正文：正文");
  });
});
```

Create `src/artifacts/plugins/prd/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prdPlugin } from "@/artifacts/plugins/prd/server";

describe("prdPlugin", () => {
  it("uses markdown instead of social-post fields", () => {
    const payload = prdPlugin.normalizeAiOutput({ title: "登录改版 PRD", markdown: "## 背景\n用户登录慢。" });

    expect(payload).toEqual({ title: "登录改版 PRD", markdown: "## 背景\n用户登录慢。" });
    expect(prdPlugin.summarizeForDirector(payload)).toContain("PRD Markdown");
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/domain.test.ts src/artifacts/registry.test.ts src/artifacts/plugins/social-post/server.test.ts src/artifacts/plugins/prd/server.test.ts
```

Expected: FAIL because `ArtifactSchema`, `NodeArtifactSchema`, artifact plugin modules, and strict session-state behavior do not exist.

- [ ] **Step 4: Implement generic schemas and plugin contracts**

In `src/artifacts/types.ts`, define:

```ts
import type { ReactNode } from "react";
import type { z } from "zod";
import type { Artifact, BranchOption, SessionState, Skill } from "@/lib/domain";

export type ArtifactCapabilities = {
  actions: string[];
  deliver: boolean;
  diff: boolean;
  edit: boolean;
  generate: boolean;
  streamFields: string[];
};

export type SeedPayloadInput = {
  creationRequest: string;
  seed: string;
  skills: Skill[];
};

export type PromptInstructionInput = {
  sourceArtifacts: Artifact[];
};

export type ArtifactActionInput = {
  artifact: Artifact;
  input: unknown;
  sessionState: SessionState;
};

export type ArtifactActionResult<TPayload> = {
  payload: TPayload;
  sourceArtifactIds?: string[];
};

export type ArtifactActionHandler<TPayload> = (input: ArtifactActionInput) => Promise<ArtifactActionResult<TPayload>>;

export type ArtifactPluginServer<TPayload, TAiOutput = TPayload> = {
  aiOutputSchema: z.ZodType<TAiOutput>;
  capabilities: ArtifactCapabilities;
  createSeedPayload(input: SeedPayloadInput): TPayload | null;
  description: string;
  handleAction?: ArtifactActionHandler<TPayload>;
  id: string;
  label: string;
  normalizeAiOutput(output: TAiOutput): TPayload;
  payloadSchema: z.ZodType<TPayload>;
  promptInstructions(input: PromptInstructionInput): string;
  summarizeForDirector(payload: TPayload): string;
  summarizeForTree(payload: TPayload): string;
};

export type ArtifactPluginClientManifest = {
  capabilities: ArtifactCapabilities;
  deliveryKey?: string;
  description: string;
  diffKey?: string;
  editorKey?: string;
  id: string;
  label: string;
  rendererKey: string;
};

export type ArtifactRendererProps = {
  artifact: Artifact;
  isBusy: boolean;
  onAction?: (actionId: string, input: unknown) => void | Promise<void>;
  onSave?: (payload: unknown) => void | Promise<void>;
};

export type ArtifactRenderer = (props: ArtifactRendererProps) => ReactNode;
```

In `src/lib/domain.ts`, remove `DraftSchema`, `NodeDraftSchema`, and `PublishPackageSchema`. Add:

```ts
export const WorkflowNodeKindSchema = z.enum(["decision", "artifact", "analysis", "action"]);

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  version: z.number().int().positive(),
  payload: z.unknown(),
  sourceArtifactIds: z.array(z.string().min(1)).default([]),
  createdByNodeId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const NodeArtifactSchema = z.object({
  nodeId: z.string().min(1),
  artifact: ArtifactSchema
});
```

Extend `TreeNodeSchema` with:

```ts
kind: WorkflowNodeKindSchema.default("decision"),
producedArtifactId: z.string().min(1).nullable().default(null),
sourceArtifactIds: z.array(z.string().min(1)).default([]),
```

Replace draft fields in `SessionStateSchema` with:

```ts
currentArtifact: ArtifactSchema.nullable(),
artifacts: z.array(ArtifactSchema).default([]),
nodeArtifacts: z.array(NodeArtifactSchema).default([]),
```

Make the object strict:

```ts
}).strict();
```

Export:

```ts
export type Artifact = z.infer<typeof ArtifactSchema>;
export type NodeArtifact = z.infer<typeof NodeArtifactSchema>;
export type WorkflowNodeKind = z.infer<typeof WorkflowNodeKindSchema>;
```

- [ ] **Step 5: Implement bundled server plugins and registry**

In `src/artifacts/plugins/social-post/schema.ts`:

```ts
import { z } from "zod";

export const SocialPostPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  hashtags: z.array(z.string()),
  imagePrompt: z.string()
});

export type SocialPostPayload = z.infer<typeof SocialPostPayloadSchema>;
```

In `src/artifacts/plugins/social-post/server.ts`:

```ts
import type { ArtifactPluginServer } from "@/artifacts/types";
import { SocialPostPayloadSchema, type SocialPostPayload } from "./schema";

export const socialPostPlugin: ArtifactPluginServer<SocialPostPayload> = {
  id: "social-post",
  label: "社媒内容",
  description: "微博、小红书、朋友圈等社交媒体内容。",
  payloadSchema: SocialPostPayloadSchema,
  aiOutputSchema: SocialPostPayloadSchema,
  capabilities: {
    actions: ["rewrite-selection"],
    deliver: true,
    diff: true,
    edit: true,
    generate: true,
    streamFields: ["title", "body", "hashtags", "imagePrompt"]
  },
  createSeedPayload(input) {
    const body = input.seed.trim();
    return body ? { title: "种子念头", body, hashtags: [], imagePrompt: "" } : null;
  },
  promptInstructions() {
    return [
      "作品类型：社媒内容。",
      "输出 JSON payload，字段为 title、body、hashtags、imagePrompt。",
      "hashtags 必须是字符串数组，imagePrompt 没有时返回空字符串。"
    ].join("\n");
  },
  normalizeAiOutput(output) {
    return SocialPostPayloadSchema.parse(output);
  },
  summarizeForDirector(payload) {
    return [`标题：${payload.title || "未命名"}`, `正文：${payload.body}`, `话题：${payload.hashtags.join("、") || "暂无"}`, `配图提示：${payload.imagePrompt || "暂无"}`].join("\n");
  },
  summarizeForTree(payload) {
    return payload.title.trim() || Array.from(payload.body.trim()).slice(0, 24).join("") || "社媒内容";
  }
};
```

In `src/artifacts/plugins/prd/schema.ts`:

```ts
import { z } from "zod";

export const PrdPayloadSchema = z.object({
  title: z.string(),
  markdown: z.string()
});

export type PrdPayload = z.infer<typeof PrdPayloadSchema>;
```

In `src/artifacts/plugins/prd/server.ts`:

```ts
import type { ArtifactPluginServer } from "@/artifacts/types";
import { PrdPayloadSchema, type PrdPayload } from "./schema";

export const prdPlugin: ArtifactPluginServer<PrdPayload> = {
  id: "prd",
  label: "PRD 文档",
  description: "产品需求文档，用 Markdown 沉淀背景、目标、需求和风险。",
  payloadSchema: PrdPayloadSchema,
  aiOutputSchema: PrdPayloadSchema,
  capabilities: {
    actions: ["export-markdown"],
    deliver: true,
    diff: true,
    edit: true,
    generate: true,
    streamFields: ["title", "markdown"]
  },
  createSeedPayload(input) {
    const seed = input.seed.trim();
    return seed ? { title: "种子 PRD", markdown: seed } : null;
  },
  promptInstructions() {
    return [
      "作品类型：PRD 文档。",
      "输出 JSON payload，字段为 title 和 markdown。",
      "markdown 必须用 Markdown 章节组织，优先包含背景、目标、非目标、用户、需求、指标、风险、待确认。"
    ].join("\n");
  },
  normalizeAiOutput(output) {
    return PrdPayloadSchema.parse(output);
  },
  summarizeForDirector(payload) {
    return [`文档标题：${payload.title || "未命名"}`, `PRD Markdown：${payload.markdown}`].join("\n");
  },
  summarizeForTree(payload) {
    return payload.title.trim() || "PRD 文档";
  }
};
```

In `src/artifacts/registry.ts`:

```ts
import type { ArtifactPluginServer } from "@/artifacts/types";
import { prdPlugin } from "@/artifacts/plugins/prd/server";
import { socialPostPlugin } from "@/artifacts/plugins/social-post/server";

const bundledPlugins = [socialPostPlugin, prdPlugin] satisfies ArtifactPluginServer<unknown, unknown>[];

function buildRegistry(plugins: ArtifactPluginServer<unknown, unknown>[]) {
  const registry = new Map<string, ArtifactPluginServer<unknown, unknown>>();
  for (const plugin of plugins) {
    if (registry.has(plugin.id)) throw new Error(`Duplicate artifact plugin id: ${plugin.id}`);
    registry.set(plugin.id, plugin);
  }
  return registry;
}

const registry = buildRegistry(bundledPlugins);

export function listArtifactPlugins() {
  return bundledPlugins;
}

export function getArtifactPlugin(type: string) {
  return registry.get(type) ?? null;
}

export function requireArtifactPlugin(type: string) {
  const plugin = getArtifactPlugin(type);
  if (!plugin) throw new Error(`Unknown artifact plugin: ${type}`);
  return plugin;
}

export function validateArtifactPayload(type: string, payload: unknown) {
  const plugin = requireArtifactPlugin(type);
  const parsed = plugin.payloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error(`Invalid artifact payload for ${type}: ${parsed.error.message}`);
  return parsed.data;
}
```

- [ ] **Step 6: Verify tests pass and commit**

Run:

```bash
npm test -- src/lib/domain.test.ts src/artifacts/registry.test.ts src/artifacts/plugins/social-post/server.test.ts src/artifacts/plugins/prd/server.test.ts
npm run typecheck
git add src/lib/domain.ts src/lib/domain.test.ts src/artifacts
git commit -m "feat: add artifact plugin domain"
```

Expected: focused tests PASS; typecheck exits 0; commit succeeds.

### Task 2: Breaking Database Schema And Repository Artifact State

**Files:**
- Modify: `src/lib/db/client.ts`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/repository.ts`
- Test: `src/lib/db/client.test.ts`
- Test: `src/lib/db/repository.test.ts`

- [ ] **Step 1: Add failing database schema tests**

In `src/lib/db/client.test.ts`, add:

```ts
it("creates artifact storage and removes draft storage from the active schema", () => {
  const db = createDatabase(":memory:");
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
  const names = tables.map((table) => table.name);

  expect(names).toContain("artifacts");
  expect(names).not.toContain("draft_versions");
  expect(names).not.toContain("publish_packages");

  const artifactColumns = db.prepare("PRAGMA table_info(artifacts)").all() as Array<{ name: string }>;
  expect(artifactColumns.map((column) => column.name)).toEqual([
    "id",
    "session_id",
    "node_id",
    "type",
    "version",
    "payload_json",
    "source_artifact_ids_json",
    "created_at",
    "updated_at"
  ]);
});
```

- [ ] **Step 2: Add failing repository tests for artifact sessions and no-artifact nodes**

In `src/lib/db/repository.test.ts`, add tests:

```ts
it("creates a session with a plugin artifact when seed payload exists", () => {
  const { repo, user } = createRepositoryHarness();
  const root = repo.saveRootMemory(user.id, {
    preferences: {
      artifactTypeId: "social-post",
      seed: "写一条关于 AI 协作的微博",
      creationRequest: "",
      domains: ["Creation"],
      tones: ["Sincere"],
      styles: ["Opinion-driven"],
      personas: ["Practitioner"]
    },
    summary: "写一条关于 AI 协作的微博",
    learnedSummary: ""
  });

  const state = repo.createSession({ userId: user.id, rootMemoryId: root.id, enabledSkillIds: [] });

  expect(state.currentArtifact?.type).toBe("social-post");
  expect(state.artifacts).toHaveLength(1);
  expect(state.currentNode?.producedArtifactId).toBe(state.currentArtifact?.id);
  expect(state).not.toHaveProperty("currentDraft");
});

it("allows a workflow node to complete without producing an artifact", () => {
  const { repo, user, state } = createArtifactSessionHarness();
  const child = repo.createArtifactChild({
    userId: user.id,
    sessionId: state.session.id,
    nodeId: state.currentNode!.id,
    selectedOptionId: "a",
    roundIntent: "只判断下一步",
    artifact: null
  });

  expect(child.currentNode?.producedArtifactId).toBeNull();
  expect(child.currentArtifact).toBeNull();
  expect(child.artifacts).toHaveLength(1);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/db/client.test.ts src/lib/db/repository.test.ts -t "artifact storage|plugin artifact|without producing an artifact"
```

Expected: FAIL because the old schema still creates `draft_versions` and repository methods are draft-specific.

- [ ] **Step 4: Replace database schema**

In `src/lib/db/client.ts`:

```ts
const CURRENT_SCHEMA_VERSION = 12;
const CONTENT_RESET_SCHEMA_VERSION = 12;
const TREEABLE_CONTENT_TABLES = ["publish_packages", "draft_versions", "artifacts", "branch_history", "tree_nodes", "session_enabled_skills", "sessions"];
```

Add before `createSchema(sqlite)` in `migrate`:

```ts
if (userVersion.user_version < CONTENT_RESET_SCHEMA_VERSION) {
  resetContentTables(sqlite);
}
```

Add:

```ts
function resetContentTables(sqlite: DatabaseSync) {
  sqlite.exec("PRAGMA foreign_keys = OFF;");
  for (const table of TREEABLE_CONTENT_TABLES) {
    sqlite.exec(`DROP TABLE IF EXISTS ${table};`);
  }
  sqlite.exec("PRAGMA foreign_keys = ON;");
}
```

Replace `tree_nodes` DDL with columns:

```sql
kind TEXT NOT NULL DEFAULT 'decision' CHECK (kind IN ('decision', 'artifact', 'analysis', 'action')),
produced_artifact_id TEXT,
source_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
```

Remove `draft_versions` and `publish_packages` DDL blocks. Add:

```sql
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  node_id TEXT NOT NULL REFERENCES tree_nodes(id),
  type TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  source_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Add indexes:

```ts
sqlite.exec("CREATE INDEX IF NOT EXISTS artifacts_session_node_idx ON artifacts(session_id, node_id, updated_at, created_at);");
sqlite.exec("CREATE INDEX IF NOT EXISTS artifacts_session_type_idx ON artifacts(session_id, type, updated_at, created_at);");
```

In `src/lib/db/schema.ts`, remove `draftVersions` and `publishPackages`, add `artifacts`, and add `kind`, `producedArtifactId`, `sourceArtifactIdsJson` to `treeNodes`.

- [ ] **Step 5: Replace repository draft methods with artifact methods**

In `src/lib/db/repository.ts`, replace exported draft methods with:

```ts
function createSession({ userId, enabledSkillIds, rootMemoryId }: { userId: string; enabledSkillIds?: string[]; rootMemoryId: string }) {
  const root = requireOwnedRootMemory(userId, rootMemoryId);
  const plugin = requireArtifactPlugin(root.preferences.artifactTypeId ?? DEFAULT_ARTIFACT_TYPE_ID);
  const seedPayload = plugin.createSeedPayload({
    creationRequest: root.preferences.creationRequest,
    seed: root.preferences.seed,
    skills: []
  });
  return createWorkflowNodeWithOptionalArtifact({
    userId,
    rootMemoryId,
    artifactTypeId: plugin.id,
    enabledSkillIds,
    parent: null,
    roundIntent: seedPayload ? plugin.summarizeForTree(seedPayload) : "种子念头",
    artifact: seedPayload ? { type: plugin.id, payload: seedPayload, sourceArtifactIds: [] } : null
  });
}
```

Add the shared write helper:

```ts
function insertArtifact({
  sessionId,
  nodeId,
  type,
  payload,
  sourceArtifactIds,
  timestamp
}: {
  sessionId: string;
  nodeId: string;
  type: string;
  payload: unknown;
  sourceArtifactIds: string[];
  timestamp: string;
}) {
  const plugin = requireArtifactPlugin(type);
  const parsedPayload = plugin.payloadSchema.parse(payload);
  const artifactId = nanoid();
  db.prepare(
    `
      INSERT INTO artifacts (id, session_id, node_id, type, version, payload_json, source_artifact_ids_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(artifactId, sessionId, nodeId, type, 1, JSON.stringify(parsedPayload), JSON.stringify(sourceArtifactIds), timestamp, timestamp);
  return artifactId;
}
```

Add `createArtifactChild`, `updateNodeArtifact`, and `completeNode` signatures:

```ts
function createArtifactChild(input: {
  artifact: { type: string; payload: unknown; sourceArtifactIds?: string[] } | null;
  customOption?: BranchOption;
  optionMode?: OptionGenerationMode;
  roundIntent?: string;
  selectedOptionId: BranchOption["id"];
  sessionId: string;
  nodeId: string;
  userId: string;
}): SessionState
```

```ts
function updateNodeArtifact(input: {
  agentMessages?: AgentMessage[];
  artifact: { type: string; payload: unknown; sourceArtifactIds?: string[] } | null;
  nodeId: string;
  roundIntent: string;
  sessionId: string;
  userId: string;
}): SessionState
```

Ensure `updateNodeArtifact` sets `tree_nodes.produced_artifact_id` to the new artifact id or `null`, sets `kind` to `"artifact"` when artifact exists and `"analysis"` when it does not, and updates `sessions.title` using `plugin.summarizeForTree(payload)` when an artifact exists.

Update `getSessionState` to query artifacts:

```ts
const artifactRows = db.prepare("SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at ASC, rowid ASC").all(sessionId) as ArtifactRow[];
const artifacts = artifactRows.map(toArtifact);
const artifactByNodeId = new Map(artifacts.map((artifact) => [artifact.createdByNodeId, artifact]));
const currentArtifact = currentNode ? artifactByNodeId.get(currentNode.id) ?? null : null;
```

Return:

```ts
currentArtifact,
artifacts,
nodeArtifacts: artifacts.map((artifact) => ({ nodeId: artifact.createdByNodeId, artifact })),
```

- [ ] **Step 6: Update session summaries to use artifact plugin summaries**

Replace `latest_body` joins with latest artifact rows. Build excerpt from plugin summary:

```ts
function artifactExcerpt(row: ArtifactRow | undefined) {
  if (!row) return "";
  const plugin = getArtifactPlugin(row.type);
  if (!plugin) return row.payload_json;
  const payload = plugin.payloadSchema.parse(parseJson(row.payload_json));
  return plugin.summarizeForTree(payload);
}
```

`toDraftSummary` can remain named `toDraftSummary` only until Task 9 renames management UI. Its body must no longer read draft columns.

- [ ] **Step 7: Verify tests pass and commit**

Run:

```bash
npm test -- src/lib/db/client.test.ts src/lib/db/repository.test.ts
npm run typecheck
git add src/lib/db/client.ts src/lib/db/schema.ts src/lib/db/repository.ts src/lib/db/client.test.ts src/lib/db/repository.test.ts
git commit -m "feat: store workflow artifacts"
```

Expected: database and repository tests PASS; typecheck exits 0; commit succeeds.

### Task 3: Artifact-Aware App State And AI Output

**Files:**
- Modify: `src/lib/app-state.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/ai/director.ts`
- Modify: `src/lib/ai/director-stream.ts`
- Test: `src/lib/app-state.test.ts`
- Test: `src/lib/ai/director.test.ts`
- Test: `src/lib/ai/director-stream.test.ts`

- [ ] **Step 1: Add failing app-state tests**

In `src/lib/app-state.test.ts`, add:

```ts
it("summarizes current artifacts through their plugins", () => {
  const state = createArtifactState({
    currentArtifact: {
      id: "artifact-1",
      type: "prd",
      version: 1,
      payload: { title: "登录 PRD", markdown: "## 背景\n登录慢。" },
      sourceArtifactIds: [],
      createdByNodeId: "node-1",
      createdAt: "2026-05-18T00:00:00.000Z",
      updatedAt: "2026-05-18T00:00:00.000Z"
    }
  });

  const summary = summarizeSessionForDirector(state);

  expect(summary.currentArtifact).toContain("PRD Markdown");
  expect(summary.currentArtifact).toContain("登录慢");
  expect(summary).not.toHaveProperty("currentDraft");
});

it("focuses a node that produced no artifact without inventing content", () => {
  const state = createArtifactState({ producedArtifactId: null, currentArtifact: null });

  const focused = focusSessionStateForNode(state, "node-1");

  expect(focused?.currentArtifact).toBeNull();
  expect(focused?.artifacts).toHaveLength(state.artifacts.length);
});
```

- [ ] **Step 2: Add failing AI schema and stream tests**

In `src/lib/ai/director.test.ts`, add:

```ts
it("parses artifact output and no-artifact output", () => {
  expect(DirectorArtifactOutputSchema.parse({
    roundIntent: "形成微博",
    artifact: { type: "social-post", payload: { title: "T", body: "B", hashtags: [], imagePrompt: "" } }
  }).artifact?.type).toBe("social-post");

  expect(DirectorNextStepOutputSchema.parse({
    action: "complete",
    roundIntent: "这一步只判断",
    artifact: null
  }).artifact).toBeNull();
});
```

In `src/lib/ai/director-stream.test.ts`, add:

```ts
it("extracts partial artifact payload fields from streaming JSON", () => {
  const partial = extractPartialDirectorArtifact('{"roundIntent":"写微博","artifact":{"type":"social-post","payload":{"title":"新标题","body":"开头');

  expect(partial?.type).toBe("social-post");
  expect(partial?.payload).toMatchObject({ title: "新标题" });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/app-state.test.ts src/lib/ai/director.test.ts src/lib/ai/director-stream.test.ts -t "artifact|no-artifact|partial artifact"
```

Expected: FAIL because app-state and AI schemas still expose draft fields.

- [ ] **Step 4: Replace app-state draft summaries**

In `src/lib/app-state.ts`, rename `currentDraft` in `DirectorInputParts` usage to `currentArtifact`. Use helper:

```ts
function formatArtifactForDirector(artifact: Artifact | null) {
  if (!artifact) return "";
  const plugin = getArtifactPlugin(artifact.type);
  if (!plugin) return JSON.stringify(artifact.payload, null, 2);
  const payload = plugin.payloadSchema.parse(artifact.payload);
  return plugin.summarizeForDirector(payload);
}
```

Update `focusSessionStateForNode`:

```ts
const currentArtifact = node.producedArtifactId
  ? state.artifacts.find((artifact) => artifact.id === node.producedArtifactId) ?? null
  : null;

return { ...state, currentNode: node, currentArtifact, selectedPath: activePathFor(treeNodes, node) };
```

Remove `formatDraftForDirector`, `formatDraftVersionSummary`, `draftForNode`, `currentDraftForState`, and `nearestAncestorDraftForNode`. Replace them with artifact helpers that use `producedArtifactId`.

- [ ] **Step 5: Update AI prompt contracts**

In `src/lib/ai/prompts.ts`, change `DirectorInputParts`:

```ts
export type DirectorInputParts = {
  artifactContext: string;
  currentArtifact: string;
  enabledSkills: Skill[];
  foldedSummary: string;
  learnedSummary: string;
  messages: DirectorMessage[];
  pathSummary: string;
  rootSummary: string;
  selectedOptionLabel: string;
};
```

Replace prompt copy:

```ts
当前产物：
${parts.currentArtifact || "暂无产物。"}
```

In `src/lib/ai/director.ts`, add:

```ts
export const DirectorArtifactOutputSchema = z.object({
  roundIntent: z.string().min(1),
  artifact: z.object({
    type: z.string().min(1),
    payload: z.unknown(),
    sourceArtifactIds: z.array(z.string().min(1)).optional()
  }).nullable().optional()
});
```

Update full output schemas so `artifact` replaces `draft`.

- [ ] **Step 6: Update stream helpers**

In `src/lib/ai/director-stream.ts`, replace draft helpers with:

```ts
export function extractPartialDirectorArtifact(text: string) {
  const parsed = extractPartialJsonObject(text);
  if (!isRecord(parsed.artifact)) return null;
  const type = typeof parsed.artifact.type === "string" ? parsed.artifact.type : "";
  const payload = isRecord(parsed.artifact.payload) ? parsed.artifact.payload : {};
  return type ? { type, payload } : null;
}
```

Replace `streamDirectorDraft` with `streamDirectorArtifact` returning `DirectorArtifactOutputSchema` output.

- [ ] **Step 7: Verify tests pass and commit**

Run:

```bash
npm test -- src/lib/app-state.test.ts src/lib/ai/director.test.ts src/lib/ai/director-stream.test.ts
npm run typecheck
git add src/lib/app-state.ts src/lib/app-state.test.ts src/lib/ai/prompts.ts src/lib/ai/director.ts src/lib/ai/director.test.ts src/lib/ai/director-stream.ts src/lib/ai/director-stream.test.ts
git commit -m "feat: make director artifact-aware"
```

Expected: focused tests PASS; typecheck exits 0; commit succeeds.

### Task 4: Artifact API Routes And Generic Streaming

**Files:**
- Create: `src/app/api/sessions/[sessionId]/artifact/route.ts`
- Create: `src/app/api/sessions/[sessionId]/artifact/generate/stream/route.ts`
- Create: `src/app/api/sessions/[sessionId]/artifact/actions/[actionId]/route.ts`
- Delete: `src/app/api/sessions/[sessionId]/draft/route.ts`
- Delete: `src/app/api/sessions/[sessionId]/draft/generate/stream/route.ts`
- Delete: `src/app/api/sessions/[sessionId]/draft/rewrite-selection/route.ts`
- Test: `src/app/api/sessions/[sessionId]/artifact/route.test.ts`
- Test: `src/app/api/sessions/[sessionId]/artifact/generate/stream/route.test.ts`
- Test: `src/app/api/sessions/[sessionId]/artifact/actions/[actionId]/route.test.ts`

- [ ] **Step 1: Add failing save route tests**

Create `src/app/api/sessions/[sessionId]/artifact/route.test.ts`:

```ts
describe("POST /api/sessions/:sessionId/artifact", () => {
  it("saves a plugin-validated artifact child", async () => {
    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact", {
        method: "POST",
        body: JSON.stringify({
          nodeId: "node-1",
          artifact: {
            type: "social-post",
            payload: { title: "Edited", body: "Edited body", hashtags: [], imagePrompt: "" },
            sourceArtifactIds: ["artifact-1"]
          }
        })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      state: {
        currentArtifact: {
          type: "social-post",
          payload: { title: "Edited", body: "Edited body", hashtags: [], imagePrompt: "" }
        }
      }
    });
  });

  it("rejects unknown artifact types", async () => {
    const response = await POST(
      new Request("http://test.local/api/sessions/session-1/artifact", {
        method: "POST",
        body: JSON.stringify({ nodeId: "node-1", artifact: { type: "unknown", payload: {} } })
      }),
      { params: Promise.resolve({ sessionId: "session-1" }) }
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Add failing stream route tests**

Create `src/app/api/sessions/[sessionId]/artifact/generate/stream/route.test.ts`:

```ts
it("streams artifact.replace when the director produces an artifact", async () => {
  mockStreamDirectorNextStep.mockResolvedValue({ action: "artifact", roundIntent: "写微博" });
  mockStreamDirectorArtifact.mockResolvedValue({
    roundIntent: "写微博",
    artifact: { type: "social-post", payload: { title: "T", body: "B", hashtags: [], imagePrompt: "" } }
  });

  const response = await POST(new Request("http://test.local", { method: "POST", body: JSON.stringify({ nodeId: "node-2" }) }), {
    params: Promise.resolve({ sessionId: "session-1" })
  });

  const text = await response.text();
  expect(text).toContain('"type":"artifact.replace"');
  expect(text).toContain('"type":"done"');
});

it("finishes successfully when the director produces no artifact", async () => {
  mockStreamDirectorNextStep.mockResolvedValue({ action: "complete", roundIntent: "只判断", artifact: null });

  const response = await POST(new Request("http://test.local", { method: "POST", body: JSON.stringify({ nodeId: "node-2" }) }), {
    params: Promise.resolve({ sessionId: "session-1" })
  });

  const text = await response.text();
  expect(text).not.toContain("artifact.replace");
  expect(text).toContain('"type":"done"');
});
```

- [ ] **Step 3: Add failing plugin action route tests**

Create `src/app/api/sessions/[sessionId]/artifact/actions/[actionId]/route.test.ts`:

```ts
it("dispatches a supported plugin action", async () => {
  const response = await POST(
    new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({
        nodeId: "node-1",
        artifactId: "artifact-1",
        input: { field: "body", selectedText: "旧文本", instruction: "改得更清楚" }
      })
    }),
    { params: Promise.resolve({ sessionId: "session-1", actionId: "rewrite-selection" }) }
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toHaveProperty("state.currentArtifact");
});

it("rejects unsupported plugin actions", async () => {
  const response = await POST(
    new Request("http://test.local", { method: "POST", body: JSON.stringify({ nodeId: "node-1", artifactId: "artifact-1", input: {} }) }),
    { params: Promise.resolve({ sessionId: "session-1", actionId: "unknown-action" }) }
  );

  expect(response.status).toBe(400);
});
```

- [ ] **Step 4: Run tests to verify failure**

Run:

```bash
npm test -- 'src/app/api/sessions/[sessionId]/artifact/route.test.ts' 'src/app/api/sessions/[sessionId]/artifact/generate/stream/route.test.ts' 'src/app/api/sessions/[sessionId]/artifact/actions/[actionId]/route.test.ts'
```

Expected: FAIL because artifact routes do not exist.

- [ ] **Step 5: Implement save artifact route**

Create `src/app/api/sessions/[sessionId]/artifact/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, isBadRequestError, publicServerErrorMessage } from "@/lib/api/errors";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { getRepository } from "@/lib/db/repository";
import { requireArtifactPlugin } from "@/artifacts/registry";

export const runtime = "nodejs";

const SaveArtifactBodySchema = z.object({
  nodeId: z.string().min(1),
  artifact: z.object({
    type: z.string().min(1),
    payload: z.unknown(),
    sourceArtifactIds: z.array(z.string().min(1)).optional()
  })
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await context.params;
  const user = await requireCurrentUser().catch((error) => {
    const response = authErrorResponse(error);
    if (response) return response;
    throw error;
  });
  if (user instanceof Response) return user;

  let body: z.infer<typeof SaveArtifactBodySchema>;
  try {
    body = SaveArtifactBodySchema.parse(await request.json());
    requireArtifactPlugin(body.artifact.type).payloadSchema.parse(body.artifact.payload);
  } catch (error) {
    if (isBadRequestError(error)) return badRequestResponse(error);
    return NextResponse.json({ error: "请求内容格式不正确。" }, { status: 400 });
  }

  try {
    const state = getRepository().createArtifactChild({
      userId: user.id,
      sessionId,
      nodeId: body.nodeId,
      selectedOptionId: "custom-edit",
      roundIntent: "手动编辑产物",
      artifact: body.artifact
    });
    return NextResponse.json({ state });
  } catch (error) {
    console.error("[tritree:update-artifact]", error);
    return NextResponse.json({ error: publicServerErrorMessage(error, "无法保存产物。") }, { status: 500 });
  }
}
```

If `selectedOptionId: "custom-edit"` does not match repository validation after Task 2, add a repository method `createEditedArtifactChild` that creates the custom option internally and call that method instead.

- [ ] **Step 6: Implement stream route**

Create `src/app/api/sessions/[sessionId]/artifact/generate/stream/route.ts` by adapting the old draft stream route:

```ts
type ArtifactStreamEvent =
  | { type: "artifact.replace"; artifact: Artifact }
  | { type: "thinking"; nodeId?: string | null; stage?: "artifact" | "options"; text: string }
  | { type: "options"; nodeId: string; options: BranchOption[]; roundIntent?: string | null }
  | { type: "done"; state: SessionState }
  | { type: "error"; error: string };
```

When director output has `artifact`, call `repository.updateNodeArtifact`, then send:

```ts
send({ type: "artifact.replace", artifact: nextState.currentArtifact });
send({ type: "done", state: nextState });
```

When director output has no artifact, call `repository.completeNode` with `producedArtifactId = null`, then send only:

```ts
send({ type: "done", state: nextState });
```

- [ ] **Step 7: Implement plugin action route**

Create `src/app/api/sessions/[sessionId]/artifact/actions/[actionId]/route.ts`:

```ts
const ActionBodySchema = z.object({
  nodeId: z.string().min(1),
  artifactId: z.string().min(1),
  input: z.unknown()
});
```

Implementation rules:

```ts
const artifact = state.artifacts.find((item) => item.id === body.artifactId);
if (!artifact) return NextResponse.json({ error: "没有找到产物。" }, { status: 404 });

const plugin = requireArtifactPlugin(artifact.type);
if (!plugin.capabilities.actions.includes(actionId) || !plugin.handleAction) {
  return NextResponse.json({ error: "这个产物不支持该操作。" }, { status: 400 });
}

const result = await plugin.handleAction({ artifact, input: body.input, sessionState: state });
const nextState = repository.createArtifactChild({
  userId: user.id,
  sessionId,
  nodeId: body.nodeId,
  selectedOptionId: "custom-edit",
  roundIntent: `${plugin.label}操作：${actionId}`,
  artifact: { type: plugin.id, payload: result.payload, sourceArtifactIds: result.sourceArtifactIds ?? [artifact.id] }
});
return NextResponse.json({ state: nextState });
```

- [ ] **Step 8: Delete old draft routes and verify**

Delete:

```bash
rm -r 'src/app/api/sessions/[sessionId]/draft'
```

Then run:

```bash
npm test -- 'src/app/api/sessions/[sessionId]/artifact/route.test.ts' 'src/app/api/sessions/[sessionId]/artifact/generate/stream/route.test.ts' 'src/app/api/sessions/[sessionId]/artifact/actions/[actionId]/route.test.ts'
npm run typecheck
git add src/app/api/sessions src/lib/ai src/lib/app-state.ts
git commit -m "feat: add artifact API routes"
```

Expected: artifact route tests PASS; typecheck exits 0; old draft route directory is gone; commit succeeds.

### Task 5: Client State And Artifact Stream Flow

**Files:**
- Modify: `src/components/TreeableApp.tsx`
- Test: `src/components/TreeableApp.test.tsx`

- [ ] **Step 1: Add failing TreeableApp tests for artifact state**

In `src/components/TreeableApp.test.tsx`, update the `LiveDraft` mock to an `ArtifactWorkspace` mock. Add tests:

```tsx
it("passes all session artifacts into the artifact workspace", async () => {
  const state = createArtifactSessionState({
    artifacts: [
      socialPostArtifact({ id: "artifact-1", createdByNodeId: "node-1", title: "微博" }),
      prdArtifact({ id: "artifact-2", createdByNodeId: "node-2", title: "PRD" })
    ]
  });
  fetchMock.mockResolvedValueOnce(skillsResponse()).mockResolvedValueOnce(rootMemoryResponse()).mockResolvedValueOnce(sessionResponse(state));

  render(<TreeableApp />);

  await screen.findByTestId("artifact-workspace");
  expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(expect.objectContaining({
    artifacts: state.artifacts,
    selectedArtifactId: "artifact-1"
  }));
});

it("keeps the selected artifact when the selected node produced no artifact", async () => {
  const state = createArtifactSessionState({
    currentNode: analysisNode({ id: "node-2", producedArtifactId: null }),
    currentArtifact: null,
    artifacts: [socialPostArtifact({ id: "artifact-1", createdByNodeId: "node-1", title: "微博" })]
  });

  render(<TreeableApp initialSessionId="session-1" />);

  await screen.findByTestId("artifact-workspace");
  expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(expect.objectContaining({
    selectedArtifactId: "artifact-1"
  }));
});

it("reads artifact.replace stream events and selects the streamed artifact", async () => {
  const finalState = createArtifactSessionState({
    currentArtifact: socialPostArtifact({ id: "artifact-2", createdByNodeId: "node-2", title: "新微博" })
  });
  fetchMock.mockResolvedValueOnce(streamResponse([
    { type: "artifact.replace", artifact: finalState.currentArtifact },
    { type: "done", state: finalState }
  ]));

  await chooseFirstOption();

  expect(artifactWorkspaceMock).toHaveBeenLastCalledWith(expect.objectContaining({
    selectedArtifactId: "artifact-2"
  }));
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/components/TreeableApp.test.tsx -t "artifact workspace|artifact.replace|produced no artifact"
```

Expected: FAIL because `TreeableApp` still imports `LiveDraft`, reads `currentDraft`, and parses draft stream events.

- [ ] **Step 3: Rename client stream types**

In `src/components/TreeableApp.tsx`, replace draft stream types with:

```ts
type ArtifactStreamEvent =
  | { type: "artifact.replace"; artifact: Artifact }
  | { type: "artifact.patch"; path: string; value: unknown }
  | { type: "options"; nodeId: string; options: BranchOption[]; roundIntent?: string | null }
  | { type: "thinking"; nodeId?: string | null; stage?: "artifact" | "options"; text: string }
  | { type: "done"; state: SessionState }
  | { type: "error"; error: string };

type StreamingArtifactEntry = {
  artifact: Artifact;
  nodeId: string;
};
```

Replace `isDraftStreamEvent` with `isArtifactStreamEvent` that validates `ArtifactSchema.safeParse(value.artifact)` for `artifact.replace`.

- [ ] **Step 4: Replace draft helpers with artifact helpers**

Add:

```ts
function artifactForNode(state: SessionState, nodeId: string | null) {
  if (!nodeId) return null;
  const node = findTreeNode(state, nodeId);
  if (!node?.producedArtifactId) return null;
  return state.artifacts.find((artifact) => artifact.id === node.producedArtifactId) ?? null;
}

function defaultSelectedArtifactId(state: SessionState | null, currentSelectedId: string | null) {
  if (!state) return null;
  if (currentSelectedId && state.artifacts.some((artifact) => artifact.id === currentSelectedId)) return currentSelectedId;
  if (state.currentArtifact) return state.currentArtifact.id;
  return state.artifacts.at(-1)?.id ?? null;
}
```

Remove `draftForNode`, `directDraftForNode`, `nearestAncestorDraftForNode`, `changedDraftNodeIdsForState`, and draft comparison helpers from core. Reintroduce comparison later inside social-post plugin only if the plugin exposes diff.

- [ ] **Step 5: Point fetch calls at artifact routes**

Replace:

```ts
fetch(`/api/sessions/${sessionId}/draft/generate/stream`, ...)
fetch(`/api/sessions/${sessionId}/draft`, ...)
fetch(`/api/sessions/${sessionId}/draft/rewrite-selection`, ...)
```

with:

```ts
fetch(apiPath(`/api/sessions/${sessionId}/artifact/generate/stream`), ...)
fetch(apiPath(`/api/sessions/${sessionId}/artifact`), ...)
fetch(apiPath(`/api/sessions/${sessionId}/artifact/actions/${encodeURIComponent(actionId)}`), ...)
```

When reading `artifact.replace`, set `streamingArtifact` and `selectedArtifactId`:

```ts
if (value.type === "artifact.replace") {
  setStreamingArtifact({ nodeId, artifact: value.artifact });
  setSelectedArtifactId(value.artifact.id);
  receivedArtifact = true;
  return;
}
```

- [ ] **Step 6: Render ArtifactWorkspace**

Replace the `LiveDraft` render with:

```tsx
<ArtifactWorkspace
  artifacts={displayArtifacts}
  currentNode={displayCurrentNode}
  isBusy={isBusy}
  isGenerating={Boolean(generationStage)}
  onAction={handleArtifactAction}
  onSave={saveArtifact}
  onSelectArtifact={setSelectedArtifactId}
  selectedArtifactId={selectedArtifactId}
  thinkingText={activeThinkingText}
/>
```

`displayArtifacts` should combine `sessionState.artifacts` with `streamingArtifact.artifact` when the stream has not finished.

- [ ] **Step 7: Verify tests pass and commit**

Run:

```bash
npm test -- src/components/TreeableApp.test.tsx -t "artifact workspace|artifact.replace|produced no artifact"
npm run typecheck
git add src/components/TreeableApp.tsx src/components/TreeableApp.test.tsx
git commit -m "feat: wire artifact state in app shell"
```

Expected: focused TreeableApp tests PASS; typecheck exits 0; commit succeeds.

### Task 6: Generic Artifact Workspace UI

**Files:**
- Create: `src/components/artifacts/ArtifactWorkspace.tsx`
- Create: `src/components/artifacts/ArtifactWorkspace.test.tsx`
- Create: `src/components/artifacts/ArtifactFallback.tsx`
- Create: `src/artifacts/client-registry.tsx`
- Create: `src/artifacts/plugins/social-post/client.tsx`
- Create: `src/artifacts/plugins/prd/client.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add failing workspace tests**

Create `src/components/artifacts/ArtifactWorkspace.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArtifactWorkspace } from "./ArtifactWorkspace";

describe("ArtifactWorkspace", () => {
  it("lists multiple artifacts and dispatches to the selected renderer", async () => {
    const user = userEvent.setup();
    render(
      <ArtifactWorkspace
        artifacts={[socialPostArtifact({ id: "artifact-1", title: "微博草稿" }), prdArtifact({ id: "artifact-2", title: "PRD" })]}
        currentNode={artifactNode({ producedArtifactId: "artifact-1" })}
        isBusy={false}
        isGenerating={false}
        onSelectArtifact={vi.fn()}
        selectedArtifactId="artifact-1"
        thinkingText=""
      />
    );

    expect(screen.getByRole("tab", { name: "微博草稿" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "PRD" }));
    expect(screen.getByText("PRD")).toBeInTheDocument();
  });

  it("keeps content visible and marks a no-artifact node", () => {
    render(
      <ArtifactWorkspace
        artifacts={[socialPostArtifact({ id: "artifact-1", title: "微博草稿" })]}
        currentNode={analysisNode({ producedArtifactId: null })}
        isBusy={false}
        isGenerating={false}
        onSelectArtifact={vi.fn()}
        selectedArtifactId="artifact-1"
        thinkingText=""
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("本步未生成产物");
    expect(screen.getByTestId("social-post-renderer")).toBeInTheDocument();
  });

  it("shows raw payload fallback when the plugin is unavailable", () => {
    render(
      <ArtifactWorkspace
        artifacts={[unknownArtifact({ id: "artifact-unknown", type: "unknown-type", payload: { value: 1 } })]}
        currentNode={artifactNode({ producedArtifactId: "artifact-unknown" })}
        isBusy={false}
        isGenerating={false}
        onSelectArtifact={vi.fn()}
        selectedArtifactId="artifact-unknown"
        thinkingText=""
      />
    );

    expect(screen.getByText("缺少产物插件")).toBeInTheDocument();
    expect(screen.getByText(/"value": 1/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/components/artifacts/ArtifactWorkspace.test.tsx
```

Expected: FAIL because the workspace and client registry do not exist.

- [ ] **Step 3: Implement client registry**

In `src/artifacts/client-registry.tsx`:

```tsx
import type { ArtifactPluginClientManifest, ArtifactRenderer } from "@/artifacts/types";
import { prdClientPlugin } from "@/artifacts/plugins/prd/client";
import { socialPostClientPlugin } from "@/artifacts/plugins/social-post/client";

const clientPlugins = [socialPostClientPlugin, prdClientPlugin];
const manifests = new Map(clientPlugins.map((plugin) => [plugin.manifest.id, plugin.manifest]));
const renderers = new Map(clientPlugins.map((plugin) => [plugin.manifest.rendererKey, plugin.Renderer]));

export function getArtifactClientManifest(type: string): ArtifactPluginClientManifest | null {
  return manifests.get(type) ?? null;
}

export function getArtifactRenderer(rendererKey: string): ArtifactRenderer | null {
  return renderers.get(rendererKey) ?? null;
}
```

Each client plugin should export:

```tsx
export const socialPostClientPlugin = {
  manifest: {
    id: "social-post",
    label: "社媒内容",
    description: "社交媒体内容",
    rendererKey: "social-post.renderer",
    editorKey: "social-post.editor",
    diffKey: "social-post.diff",
    deliveryKey: "social-post.delivery",
    capabilities: socialPostPlugin.capabilities
  },
  Renderer: SocialPostRenderer
};
```

- [ ] **Step 4: Implement workspace and fallback**

In `src/components/artifacts/ArtifactFallback.tsx`:

```tsx
import type { Artifact } from "@/lib/domain";

export function ArtifactFallback({ artifact }: { artifact: Artifact }) {
  return (
    <section className="artifact-fallback">
      <h2>缺少产物插件</h2>
      <p>无法加载 `{artifact.type}` 的展示插件，下面保留原始 payload。</p>
      <pre>{JSON.stringify(artifact.payload, null, 2)}</pre>
    </section>
  );
}
```

In `src/components/artifacts/ArtifactWorkspace.tsx`:

```tsx
export function ArtifactWorkspace({
  artifacts,
  currentNode,
  isBusy,
  isGenerating,
  onAction,
  onSave,
  onSelectArtifact,
  selectedArtifactId,
  thinkingText
}: ArtifactWorkspaceProps) {
  const selectedArtifact = artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts.at(-1) ?? null;
  const selectedManifest = selectedArtifact ? getArtifactClientManifest(selectedArtifact.type) : null;
  const Renderer = selectedManifest ? getArtifactRenderer(selectedManifest.rendererKey) : null;
  const currentNodeProducedArtifact = Boolean(currentNode?.producedArtifactId);

  return (
    <aside aria-busy={isGenerating} className={`artifact-workspace${isGenerating ? " module--generating" : ""}`}>
      <div className="panel-heading">
        <span>产物</span>
      </div>
      {artifacts.length ? (
        <div aria-label="产物列表" className="artifact-tabs" role="tablist">
          {artifacts.map((artifact) => (
            <button
              aria-selected={selectedArtifact?.id === artifact.id}
              key={artifact.id}
              onClick={() => onSelectArtifact(artifact.id)}
              role="tab"
              type="button"
            >
              {artifactLabel(artifact)}
            </button>
          ))}
        </div>
      ) : null}
      {!currentNodeProducedArtifact && currentNode ? (
        <p className="artifact-workspace__node-status" role="status">本步未生成产物</p>
      ) : null}
      {isBusy && thinkingText.trim() ? <pre className="artifact-workspace__thinking">{thinkingText.trim()}</pre> : null}
      {selectedArtifact && Renderer ? (
        <Renderer artifact={selectedArtifact} isBusy={isBusy} onAction={onAction} onSave={onSave} />
      ) : selectedArtifact ? (
        <ArtifactFallback artifact={selectedArtifact} />
      ) : (
        <div className="artifact-empty-state">
          <p>当前流程还没有产物。</p>
        </div>
      )}
    </aside>
  );
}
```

Use plugin summaries for `artifactLabel`; fall back to artifact type and short id when plugin validation fails.

- [ ] **Step 5: Add core CSS**

In `src/app/globals.css`, add workspace styles:

```css
.artifact-workspace {
  background: var(--panel-bg);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.artifact-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 10px 14px;
}

.artifact-tabs button[aria-selected="true"] {
  background: #111827;
  color: #ffffff;
}

.artifact-workspace__node-status,
.artifact-empty-state {
  color: var(--muted-text);
  padding: 10px 16px;
}

.artifact-fallback pre {
  white-space: pre-wrap;
  word-break: break-word;
}
```

- [ ] **Step 6: Verify tests pass and commit**

Run:

```bash
npm test -- src/components/artifacts/ArtifactWorkspace.test.tsx
npm run typecheck
git add src/components/artifacts src/artifacts/client-registry.tsx src/artifacts/plugins/social-post/client.tsx src/artifacts/plugins/prd/client.tsx src/app/globals.css
git commit -m "feat: add artifact workspace"
```

Expected: workspace tests PASS; typecheck exits 0; commit succeeds.

### Task 7: Move Social Post UI And Actions Into Plugin

**Files:**
- Move: `src/components/draft/LiveDraft.tsx` to `src/artifacts/plugins/social-post/SocialPostRenderer.tsx`
- Move: `src/components/draft/LiveDraft.test.tsx` to `src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx`
- Create: `src/artifacts/plugins/social-post/actions.ts`
- Modify: `src/artifacts/plugins/social-post/server.ts`
- Modify: `src/artifacts/plugins/social-post/client.tsx`
- Modify: `src/app/globals.css`
- Test: `src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx`
- Test: `src/artifacts/plugins/social-post/actions.test.ts`

- [ ] **Step 1: Add failing social-post action tests**

Create `src/artifacts/plugins/social-post/actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { replaceSocialPostSelection } from "./actions";

describe("replaceSocialPostSelection", () => {
  it("replaces selected body text only", () => {
    const payload = { title: "T", body: "第一句。第二句。", hashtags: ["#AI"], imagePrompt: "图" };

    expect(replaceSocialPostSelection(payload, {
      field: "body",
      selectedText: "第二句",
      selectionStart: 4,
      selectionEnd: 7,
      replacementText: "改写句"
    })).toEqual({ title: "T", body: "第一句。改写句。", hashtags: ["#AI"], imagePrompt: "图" });
  });
});
```

- [ ] **Step 2: Move renderer tests and rename props**

Move the existing `LiveDraft` tests. Replace test imports:

```ts
import { SocialPostRenderer } from "./SocialPostRenderer";
```

Replace render calls with:

```tsx
<SocialPostRenderer
  artifact={artifactFromSocialPostPayload({ title: "Draft", body: "Draft body", hashtags: ["#draft"], imagePrompt: "draft image" })}
  isBusy={false}
  onAction={onAction}
  onSave={onSave}
/>
```

Keep tests for body rendering, editing, diff, delivery, copy actions, and selected-text action. Delete tests that assert core `LiveDraft` naming.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm test -- src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx src/artifacts/plugins/social-post/actions.test.ts
```

Expected: FAIL because renderer/action modules do not exist.

- [ ] **Step 4: Extract renderer component**

Move `LiveDraft.tsx` into `SocialPostRenderer.tsx`. Change props to:

```ts
export function SocialPostRenderer({ artifact, isBusy, onAction, onSave }: ArtifactRendererProps) {
  const payload = SocialPostPayloadSchema.parse(artifact.payload);
}
```

Replace every `Draft` type with `SocialPostPayload`. Replace `onRewriteSelection` with:

```ts
await onAction?.("rewrite-selection", {
  field: "body",
  instruction,
  selectedText,
  selectionEnd,
  selectionStart
});
```

Replace `onSave(editedDraft)` with:

```ts
await onSave?.(editedPayload);
```

Keep plugin-local CSS class names that are visually specific, but rename core panel classes from `.draft-panel` to `.social-post-panel` in this component.

- [ ] **Step 5: Implement selected-text action helper**

In `src/artifacts/plugins/social-post/actions.ts`:

```ts
import { z } from "zod";
import { SocialPostPayloadSchema, type SocialPostPayload } from "./schema";

export const SocialPostRewriteSelectionInputSchema = z.object({
  field: z.literal("body"),
  instruction: z.string().trim().min(1).max(1200),
  selectedText: z.string().min(1).max(6000),
  selectionStart: z.number().int().nonnegative(),
  selectionEnd: z.number().int().nonnegative()
});

export function replaceSocialPostSelection(
  payload: SocialPostPayload,
  input: z.infer<typeof SocialPostRewriteSelectionInputSchema> & { replacementText: string }
) {
  const parsedPayload = SocialPostPayloadSchema.parse(payload);
  if (parsedPayload.body.slice(input.selectionStart, input.selectionEnd) !== input.selectedText) {
    throw new Error("Selected text no longer matches the social-post body.");
  }
  return {
    ...parsedPayload,
    body: `${parsedPayload.body.slice(0, input.selectionStart)}${input.replacementText}${parsedPayload.body.slice(input.selectionEnd)}`
  };
}
```

In `social-post/server.ts`, add `handleAction` for `rewrite-selection` that calls existing `rewriteSelectedDraftText` logic after renaming it to social-post language in Task 9.

- [ ] **Step 6: Wire client plugin**

In `src/artifacts/plugins/social-post/client.tsx`, export:

```tsx
import { SocialPostRenderer } from "./SocialPostRenderer";
import { socialPostPlugin } from "./server";

export const socialPostClientPlugin = {
  manifest: {
    id: socialPostPlugin.id,
    label: socialPostPlugin.label,
    description: socialPostPlugin.description,
    rendererKey: "social-post.renderer",
    editorKey: "social-post.editor",
    diffKey: "social-post.diff",
    deliveryKey: "social-post.delivery",
    capabilities: socialPostPlugin.capabilities
  },
  Renderer: SocialPostRenderer
};
```

- [ ] **Step 7: Verify tests pass and commit**

Run:

```bash
npm test -- src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx src/artifacts/plugins/social-post/actions.test.ts
npm run typecheck
git add src/artifacts/plugins/social-post src/app/globals.css
git rm src/components/draft/LiveDraft.tsx src/components/draft/LiveDraft.test.tsx
git commit -m "feat: move social post UI into plugin"
```

Expected: social-post plugin tests PASS; typecheck exits 0; old core draft component files are removed; commit succeeds.

### Task 8: PRD Plugin Client Surface

**Files:**
- Create: `src/artifacts/plugins/prd/PrdRenderer.tsx`
- Create: `src/artifacts/plugins/prd/PrdRenderer.test.tsx`
- Modify: `src/artifacts/plugins/prd/client.tsx`
- Modify: `src/artifacts/plugins/prd/server.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add failing PRD renderer tests**

Create `src/artifacts/plugins/prd/PrdRenderer.test.tsx`:

```tsx
describe("PrdRenderer", () => {
  it("renders markdown and section checks", () => {
    render(
      <PrdRenderer
        artifact={artifactFromPrdPayload({ title: "登录 PRD", markdown: "## 背景\n登录慢。\n\n## 目标\n更快。" })}
        isBusy={false}
      />
    );

    expect(screen.getByRole("heading", { name: "登录 PRD" })).toBeInTheDocument();
    expect(screen.getByText("登录慢。")).toBeInTheDocument();
    expect(screen.getByText("已包含：背景")).toBeInTheDocument();
    expect(screen.getByText("缺少：风险")).toBeInTheDocument();
  });

  it("saves edited markdown payloads", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<PrdRenderer artifact={artifactFromPrdPayload({ title: "旧", markdown: "旧内容" })} isBusy={false} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "编辑" }));
    await user.clear(screen.getByRole("textbox", { name: "文档标题" }));
    await user.type(screen.getByRole("textbox", { name: "文档标题" }), "新 PRD");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "新 PRD" }));
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/artifacts/plugins/prd/PrdRenderer.test.tsx
```

Expected: FAIL because `PrdRenderer` does not exist.

- [ ] **Step 3: Implement PRD renderer**

Create `PrdRenderer.tsx`:

```tsx
import { useState } from "react";
import type { ArtifactRendererProps } from "@/artifacts/types";
import { PrdPayloadSchema } from "./schema";

const requiredSections = ["背景", "目标", "非目标", "用户", "需求", "指标", "风险", "待确认"];

export function PrdRenderer({ artifact, isBusy, onSave }: ArtifactRendererProps) {
  const payload = PrdPayloadSchema.parse(artifact.payload);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(payload.title);
  const [markdown, setMarkdown] = useState(payload.markdown);

  if (isEditing) {
    return (
      <section className="prd-artifact">
        <label>
          <span>文档标题</span>
          <input aria-label="文档标题" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>PRD Markdown</span>
          <textarea aria-label="PRD Markdown" rows={16} value={markdown} onChange={(event) => setMarkdown(event.target.value)} />
        </label>
        <button disabled={isBusy} onClick={() => void onSave?.({ title, markdown })} type="button">保存</button>
      </section>
    );
  }

  return (
    <section className="prd-artifact">
      <div className="prd-artifact__header">
        <h2>{payload.title || "未命名 PRD"}</h2>
        <button disabled={isBusy} onClick={() => setIsEditing(true)} type="button">编辑</button>
      </div>
      <div className="prd-artifact__markdown">
        {payload.markdown.split(/\n{2,}/).map((block, index) => <p key={`${index}-${block}`}>{block.replace(/^#{1,6}\s*/, "")}</p>)}
      </div>
      <div aria-label="PRD 检查" className="prd-artifact__checks">
        {requiredSections.map((section) => (
          <p key={section}>{hasMarkdownSection(payload.markdown, section) ? "已包含" : "缺少"}：{section}</p>
        ))}
      </div>
    </section>
  );
}

function hasMarkdownSection(markdown: string, section: string) {
  return new RegExp(`(^|\\n)#{1,6}\\s*${section}(\\s|$|[：:])`).test(markdown);
}
```

- [ ] **Step 4: Wire PRD client plugin and CSS**

In `src/artifacts/plugins/prd/client.tsx`, export `PrdRenderer` as the renderer. Add CSS:

```css
.prd-artifact {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.prd-artifact__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.prd-artifact__markdown {
  line-height: 1.7;
  white-space: pre-wrap;
}

.prd-artifact__checks {
  display: grid;
  gap: 6px;
}
```

- [ ] **Step 5: Verify tests pass and commit**

Run:

```bash
npm test -- src/artifacts/plugins/prd/PrdRenderer.test.tsx src/artifacts/plugins/prd/server.test.ts
npm run typecheck
git add src/artifacts/plugins/prd src/app/globals.css
git commit -m "feat: add prd artifact plugin UI"
```

Expected: PRD tests PASS; typecheck exits 0; commit succeeds.

### Task 9: Remove Remaining Draft Core Names And Run Final Verification

**Files:**
- Modify: `src/components/drafts/DraftManagementPanel.tsx`
- Modify: `src/components/drafts/DraftManagementPanel.test.tsx`
- Modify: `src/app/drafts/page.tsx`
- Modify: `src/lib/ai/selection-rewrite.ts`
- Modify: `src/lib/seed-draft.ts`
- Modify: `src/lib/artifacts.ts`
- Modify: `README.md`
- Delete: old draft-only files that remain after Tasks 1-8
- Test: affected tests from search results

- [ ] **Step 1: Search for forbidden core draft references**

Run:

```bash
rg -n "Draft|draft|publishPackage|nodeDrafts|currentDraft|LiveDraft|draft_versions|publish_packages" src README.md
```

Expected before cleanup: matches remain in management UI names, old helper files, test fixtures, and plugin-local files. Core matches outside `src/artifacts/plugins/social-post` must be removed or renamed.

- [ ] **Step 2: Rename management surface from drafts to sessions or works**

Rename UI labels and types:

```ts
DraftSummarySchema -> WorkSummarySchema
DraftSummary -> WorkSummary
DraftManagementPanel -> WorkManagementPanel
bodyExcerpt -> artifactExcerpt
bodyLength -> artifactSummaryLength
```

Keep route `/drafts` only if the product URL must stay stable. If the route stays, page internals should import `WorkManagementPanel` and user-facing copy should use `我的作品` or `我的流程`.

- [ ] **Step 3: Move social-post-only helpers into plugin**

Move `src/lib/seed-draft.ts` behavior into `src/artifacts/plugins/social-post/seed.ts`:

```ts
export function resolveSocialPostTitle(title: string, body: string) {
  const trimmedTitle = title.trim();
  if (trimmedTitle && trimmedTitle !== "种子念头") return trimmedTitle;
  return Array.from(body.trim().split(/\s+/)[0] ?? "").slice(0, 24).join("") || "未命名内容";
}
```

Delete or empty `src/lib/artifacts.ts` after its generic responsibilities move to `src/artifacts/registry.ts`.

- [ ] **Step 4: Rename selection rewrite AI to plugin-local action**

Move `src/lib/ai/selection-rewrite.ts` to `src/artifacts/plugins/social-post/selection-rewrite.ts`. Rename exported types and prompt copy:

```ts
type SocialPostSelectionRewriteInput = {
  currentPayload: SocialPostPayload;
  field: "body";
  instruction: string;
  selectedText: string;
};
```

The prompt should say:

```txt
You rewrite only the selected passage from a social-post artifact.
Do not include explanations, Markdown, or the full artifact.
```

- [ ] **Step 5: Delete obsolete tests and update imports**

Delete tests for old routes:

```bash
git rm 'src/app/api/sessions/[sessionId]/draft/route.test.ts'
git rm 'src/app/api/sessions/[sessionId]/draft/generate/stream/route.test.ts'
git rm 'src/app/api/sessions/[sessionId]/draft/rewrite-selection/route.test.ts'
```

Update remaining tests to use `currentArtifact`, `artifacts`, and `nodeArtifacts`.

- [ ] **Step 6: Run focused verification**

Run:

```bash
npm test -- src/lib/domain.test.ts src/artifacts/registry.test.ts src/lib/db/client.test.ts src/lib/db/repository.test.ts src/lib/app-state.test.ts src/lib/ai/director.test.ts src/lib/ai/director-stream.test.ts src/components/artifacts/ArtifactWorkspace.test.tsx src/artifacts/plugins/social-post/SocialPostRenderer.test.tsx src/artifacts/plugins/prd/PrdRenderer.test.tsx src/components/TreeableApp.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run forbidden-reference verification**

Run:

```bash
rg -n "Draft|draft|publishPackage|nodeDrafts|currentDraft|LiveDraft|draft_versions|publish_packages" src README.md
```

Expected allowed matches only:

```txt
src/artifacts/plugins/social-post/... user-facing "draft" copy if intentionally kept
src/app/drafts/page.tsx only if the route path remains stable
```

No matches should remain in `src/lib/domain.ts`, `src/lib/db/repository.ts`, `src/lib/app-state.ts`, `src/components/TreeableApp.tsx`, or `src/app/api/sessions`.

- [ ] **Step 8: Run full verification and commit**

Run:

```bash
npm run typecheck
npm test
npm run build
git status --short
git add src README.md package.json package-lock.json
git commit -m "refactor: remove draft core model"
```

Expected: typecheck PASS; full test suite PASS; build PASS; only intended files staged; commit succeeds.
