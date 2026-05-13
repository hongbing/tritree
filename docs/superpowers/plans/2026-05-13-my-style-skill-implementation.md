# My Style Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Seed-screen `我的风格` workbench that generates an editable user style skill from pasted samples or a configured external provider, then saves and enables it for the current work.

**Architecture:** Add a focused style-profile service layer for normalization, personal-style detection, internal sample generation, and optional external provider calls. Add two authenticated generation routes that return unsaved `SkillUpsert` drafts, then reuse existing skill create/update APIs for persistence. Add a client `StyleProfileSetup` component inside `RootMemorySetup` so generated skills update the Seed screen's selected skill ids before session start.

**Tech Stack:** Next.js 16 App Router route handlers, React 19 controlled components, Zod schemas, Mastra Agent structured output, Vitest, Testing Library.

---

## Current Documentation Notes

Context7 was checked for the framework APIs used in this plan:

- Next.js 16 route handlers are defined in `route.ts` files by exporting HTTP method functions such as `GET` and `POST`. `POST` handlers read JSON with `await request.json()` and return JSON with `Response.json` or `NextResponse.json`.
- React 19 controlled forms use `useState`, `value`, and `onChange`; conditional form surfaces can be rendered from state and disabled while async submission is running.

## File Structure

Create:

- `src/lib/skills/style-profile.ts`: pure helpers, schemas, errors, normalization, personal-style detection, external provider client, and sample prompt builder.
- `src/lib/skills/style-profile.test.ts`: unit tests for normalization, personal-style detection, provider availability, external provider success, provider failure, and provider schema validation.
- `src/lib/ai/style-profile-generator.ts`: Mastra-backed internal generator that turns samples into a style skill draft.
- `src/lib/ai/style-profile-generator.test.ts`: tests for internal generation prompt construction, empty/insufficient sample handling, and normalization.
- `src/app/api/skills/style/generate-from-samples/route.ts`: authenticated route returning a skill draft from pasted samples.
- `src/app/api/skills/style/generate-external/route.ts`: authenticated route returning a skill draft from the external provider.
- `src/app/api/skills/style/route.test.ts`: route tests for both generation endpoints.
- `src/components/root-memory/StyleProfileSetup.tsx`: Seed-screen style workbench and editable review form.
- `src/components/root-memory/StyleProfileSetup.test.tsx`: component tests for expanded/collapsed states, sample generation, external generation, save modes, errors, and selected-skill updates.

Modify:

- `src/app/api/skills/route.ts`: include `styleProfile.externalStyleGenerationAvailable` in the existing `GET /api/skills` response.
- `src/app/api/skills/route.test.ts`: assert the new config flag in the existing skills list response.
- `src/components/root-memory/RootMemorySetup.tsx`: render `StyleProfileSetup`, pass style config, create/update callbacks, and merge saved skill ids into local selected skills.
- `src/components/root-memory/RootMemorySetup.test.tsx`: assert saved personal styles are submitted as enabled skill ids.
- `src/components/TreeableApp.tsx`: store external style availability from `/api/skills`, adapt skill create/update helpers to return saved skills, and pass them into `RootMemorySetup`.
- `src/components/TreeableApp.test.tsx`: update mocked skills payload shape if existing tests assume only `skills` and `creationRequestOptions`.
- `src/app/globals.css`: add restrained styles for the Seed-screen style workbench.

## Task 1: Pure Style Profile Service

**Files:**
- Create: `src/lib/skills/style-profile.ts`
- Create: `src/lib/skills/style-profile.test.ts`

- [ ] **Step 1: Write failing tests for normalization and personal-style detection**

Create `src/lib/skills/style-profile.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/lib/domain";
import {
  ExternalStyleProviderUnavailableError,
  MY_STYLE_TITLE_PREFIX,
  externalStyleProviderAvailable,
  fetchExternalStyleProfile,
  isPersonalStyleSkill,
  normalizeGeneratedStyleDraft,
  splitRepresentativeSamples
} from "./style-profile";

const styleSkill: Skill = {
  id: "style-1",
  title: "我的风格：克制产品随笔",
  category: "风格",
  description: "克制、具体。",
  prompt: "写作时保持克制、具体。",
  appliesTo: "writer",
  isSystem: false,
  defaultEnabled: false,
  isArchived: false,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z"
};

describe("style profile helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("identifies user-owned personal style skills by convention", () => {
    expect(isPersonalStyleSkill(styleSkill)).toBe(true);
    expect(isPersonalStyleSkill({ ...styleSkill, isSystem: true })).toBe(false);
    expect(isPersonalStyleSkill({ ...styleSkill, category: "约束" })).toBe(false);
    expect(isPersonalStyleSkill({ ...styleSkill, title: "自然短句" })).toBe(false);
    expect(isPersonalStyleSkill({ ...styleSkill, isArchived: true })).toBe(false);
  });

  it("normalizes generated drafts into writable personal style skills", () => {
    expect(
      normalizeGeneratedStyleDraft({
        title: "克制产品随笔",
        description: "  偏克制、具体。 ",
        prompt: "  使用短句，少形容词。 ",
        category: "检查",
        appliesTo: "both",
        defaultEnabled: true,
        isArchived: true
      })
    ).toEqual({
      title: `${MY_STYLE_TITLE_PREFIX}克制产品随笔`,
      category: "风格",
      description: "偏克制、具体。",
      prompt: "使用短句，少形容词。",
      appliesTo: "writer",
      defaultEnabled: false,
      isArchived: false
    });
  });

  it("rejects generated drafts without a prompt", () => {
    expect(() =>
      normalizeGeneratedStyleDraft({
        title: "克制产品随笔",
        description: "偏克制、具体。",
        prompt: ""
      })
    ).toThrow("生成的风格内容不完整。");
  });

  it("splits representative samples by blank lines and trims empty entries", () => {
    expect(splitRepresentativeSamples(" 第一段内容。\n\n\n第二段内容。\n  \n第三段内容。 ")).toEqual([
      "第一段内容。",
      "第二段内容。",
      "第三段内容。"
    ]);
  });

  it("detects external provider availability from URL configuration", () => {
    expect(externalStyleProviderAvailable({})).toBe(false);
    expect(externalStyleProviderAvailable({ TRITREE_STYLE_PROFILE_URL: "   " })).toBe(false);
    expect(externalStyleProviderAvailable({ TRITREE_STYLE_PROFILE_URL: "https://style.example/generate" })).toBe(true);
  });
});

describe("fetchExternalStyleProfile", () => {
  it("throws unavailable when the provider URL is missing", async () => {
    await expect(
      fetchExternalStyleProfile({
        env: {},
        user: { id: "user-1", username: "awei", displayName: "Awei" }
      })
    ).rejects.toBeInstanceOf(ExternalStyleProviderUnavailableError);
  });

  it("calls the configured provider and normalizes its skill draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        skillDraft: {
          title: "克制产品随笔",
          description: "短句、具体、少夸张。",
          prompt: "保持短句，写具体例子。"
        }
      })
    });

    const draft = await fetchExternalStyleProfile({
      env: {
        TRITREE_STYLE_PROFILE_URL: "https://style.example/generate",
        TRITREE_STYLE_PROFILE_TOKEN: "secret-token"
      },
      fetchImpl: fetchMock,
      user: { id: "user-1", username: "awei", displayName: "Awei" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://style.example/generate",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token"
        }),
        body: JSON.stringify({
          user: { id: "user-1", username: "awei", displayName: "Awei" }
        })
      })
    );
    expect(draft.title).toBe("我的风格：克制产品随笔");
    expect(draft.category).toBe("风格");
    expect(draft.appliesTo).toBe("writer");
  });

  it("returns a public error when the provider rejects the request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "bad token"
    });

    await expect(
      fetchExternalStyleProfile({
        env: { TRITREE_STYLE_PROFILE_URL: "https://style.example/generate" },
        fetchImpl: fetchMock,
        user: { id: "user-1", username: "awei", displayName: "Awei" }
      })
    ).rejects.toThrow("外部风格服务返回 401：bad token");
  });

  it("rejects bad provider schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: { title: "缺提示词" } })
    });

    await expect(
      fetchExternalStyleProfile({
        env: { TRITREE_STYLE_PROFILE_URL: "https://style.example/generate" },
        fetchImpl: fetchMock,
        user: { id: "user-1", username: "awei", displayName: "Awei" }
      })
    ).rejects.toThrow("生成的风格内容不完整。");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/lib/skills/style-profile.test.ts
```

Expected: FAIL because `src/lib/skills/style-profile.ts` does not exist.

- [ ] **Step 3: Implement the pure service helpers**

Create `src/lib/skills/style-profile.ts` with:

```ts
import { z } from "zod";
import { SkillUpsertSchema, type Skill, type SkillUpsert } from "@/lib/domain";

export const MY_STYLE_TITLE_PREFIX = "我的风格：";
export const STYLE_PROFILE_URL_ENV = "TRITREE_STYLE_PROFILE_URL";
export const STYLE_PROFILE_TOKEN_ENV = "TRITREE_STYLE_PROFILE_TOKEN";

const GeneratedStyleDraftSchema = z.object({
  title: z.string().trim().min(1).max(40),
  description: z.string().trim().max(240).default(""),
  prompt: z.string().trim().min(1)
});

export type StyleProfileUser = {
  id: string;
  username: string;
  displayName: string;
};

type FetchLike = typeof fetch;

export class StyleProfileGenerationError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "StyleProfileGenerationError";
  }
}

export class ExternalStyleProviderUnavailableError extends StyleProfileGenerationError {
  constructor() {
    super("外部风格生成没有配置。", 503);
    this.name = "ExternalStyleProviderUnavailableError";
  }
}

export function isPersonalStyleSkill(
  skill: Pick<Skill, "category" | "isArchived" | "isSystem" | "title">
) {
  return !skill.isSystem && !skill.isArchived && skill.category === "风格" && skill.title.startsWith(MY_STYLE_TITLE_PREFIX);
}

export function splitRepresentativeSamples(value: string) {
  return value
    .split(/\n{2,}/)
    .map((sample) => sample.trim())
    .filter(Boolean);
}

export function normalizeGeneratedStyleDraft(value: unknown): SkillUpsert {
  const parsed = GeneratedStyleDraftSchema.safeParse(value);
  if (!parsed.success) {
    throw new StyleProfileGenerationError("生成的风格内容不完整。", 502);
  }

  const title = withPersonalStylePrefix(parsed.data.title);
  return SkillUpsertSchema.parse({
    title,
    category: "风格",
    description: parsed.data.description,
    prompt: parsed.data.prompt,
    appliesTo: "writer",
    defaultEnabled: false,
    isArchived: false
  });
}

export function externalStyleProviderAvailable(env: Record<string, string | undefined> = process.env) {
  return Boolean(env[STYLE_PROFILE_URL_ENV]?.trim());
}

export async function fetchExternalStyleProfile({
  env = process.env,
  fetchImpl = fetch,
  user
}: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  user: StyleProfileUser;
}) {
  const url = env[STYLE_PROFILE_URL_ENV]?.trim();
  if (!url) throw new ExternalStyleProviderUnavailableError();

  const token = env[STYLE_PROFILE_TOKEN_ENV]?.trim();
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new StyleProfileGenerationError(
      `外部风格服务返回 ${response.status}${text.trim() ? `：${text.trim()}` : ""}`,
      response.status === 401 || response.status === 403 ? response.status : 502
    );
  }

  const data = (await response.json()) as { skillDraft?: unknown };
  return normalizeGeneratedStyleDraft(data.skillDraft);
}

export function buildStyleProfileUserPrompt(samples: string[]) {
  const sampleText = samples.map((sample, index) => `样本 ${index + 1}：\n${sample}`).join("\n\n");

  return `
请从以下代表作中归纳作者可复用的写作风格，并生成一个 Tritree Skill 草稿。

要求：
- 只归纳表达习惯，不把样本主题当成作者长期兴趣。
- 关注句子节奏、细节密度、语气温度、读者关系、结构习惯和需要避免的表达。
- 不要复制样本中的长句或隐私信息。
- 如果样本明显不足以归纳风格，返回 prompt 字段说明需要更多样本。
- 返回 title、description、prompt 三个字段。

代表作：
${sampleText}
`.trim();
}

function withPersonalStylePrefix(title: string) {
  const trimmed = title.trim().replace(new RegExp(`^${escapeRegExp(MY_STYLE_TITLE_PREFIX)}\\s*`), "");
  return `${MY_STYLE_TITLE_PREFIX}${trimmed}`.slice(0, 40);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Step 4: Run service tests**

Run:

```bash
npm test -- src/lib/skills/style-profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills/style-profile.ts src/lib/skills/style-profile.test.ts
git commit -m "feat: add style profile helpers"
```

## Task 2: Internal AI Style Generation

**Files:**
- Create: `src/lib/ai/style-profile-generator.ts`
- Create: `src/lib/ai/style-profile-generator.test.ts`

- [ ] **Step 1: Write failing tests for internal generation**

Create `src/lib/ai/style-profile-generator.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateStyleFromSamples } from "./style-profile-generator";

const mocks = vi.hoisted(() => ({
  agentConstructor: vi.fn(),
  createAnthropic: vi.fn()
}));

vi.mock("@mastra/core/agent", () => ({
  Agent: mocks.agentConstructor
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic
}));

const modelFactory = vi.fn((modelId: string) => ({ modelId }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAnthropic.mockReturnValue(modelFactory);
  mocks.agentConstructor.mockImplementation(function FakeAgent(options) {
    return {
      options,
      generate: vi.fn(async () => ({
        object: {
          title: "克制产品随笔",
          description: "短句、具体、少夸张。",
          prompt: "写作时使用短句，保留具体例子，避免夸张承诺。"
        }
      }))
    };
  });
});

describe("generateStyleFromSamples", () => {
  it("rejects empty samples before calling the model", async () => {
    await expect(generateStyleFromSamples({ samples: [" ", "\n"] })).rejects.toThrow("请先粘贴至少一段代表作。");
    expect(mocks.agentConstructor).not.toHaveBeenCalled();
  });

  it("builds a Mastra agent and normalizes the returned skill draft", async () => {
    const draft = await generateStyleFromSamples({
      env: { KIMI_API_KEY: "token" },
      samples: ["第一段代表作。", "第二段代表作。"]
    });

    expect(mocks.agentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tritree-style-profile-agent",
        name: "Tritree Style Profile Agent",
        instructions: expect.stringContaining("归纳用户写作风格")
      })
    );
    const agentInstance = mocks.agentConstructor.mock.results[0].value as { generate: ReturnType<typeof vi.fn> };
    expect(agentInstance.generate).toHaveBeenCalledWith(
      [expect.objectContaining({ role: "user", content: expect.stringContaining("样本 1") })],
      expect.objectContaining({
        structuredOutput: expect.objectContaining({ jsonPromptInjection: true })
      })
    );
    expect(draft).toEqual({
      title: "我的风格：克制产品随笔",
      category: "风格",
      description: "短句、具体、少夸张。",
      prompt: "写作时使用短句，保留具体例子，避免夸张承诺。",
      appliesTo: "writer",
      defaultEnabled: false,
      isArchived: false
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- src/lib/ai/style-profile-generator.test.ts
```

Expected: FAIL because `src/lib/ai/style-profile-generator.ts` does not exist.

- [ ] **Step 3: Implement the internal generator**

Create `src/lib/ai/style-profile-generator.ts` with:

```ts
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { SkillUpsert } from "@/lib/domain";
import { createTreeableAnthropicModel } from "@/lib/ai/mastra-agents";
import {
  StyleProfileGenerationError,
  buildStyleProfileUserPrompt,
  normalizeGeneratedStyleDraft
} from "@/lib/skills/style-profile";

const StyleProfileOutputSchema = z.object({
  title: z.string(),
  description: z.string(),
  prompt: z.string()
});

type StyleProfileAgentLike = {
  generate: (
    messages: Array<{ role: "user"; content: string }>,
    options: {
      abortSignal?: AbortSignal;
      structuredOutput: { jsonPromptInjection: boolean; schema: typeof StyleProfileOutputSchema };
    }
  ) => Promise<{ object?: unknown; output?: unknown }>;
};

export async function generateStyleFromSamples({
  env,
  samples,
  signal,
  styleAgent
}: {
  env?: Record<string, string | undefined>;
  samples: string[];
  signal?: AbortSignal;
  styleAgent?: StyleProfileAgentLike;
}): Promise<SkillUpsert> {
  const normalizedSamples = samples.map((sample) => sample.trim()).filter(Boolean);
  if (normalizedSamples.length === 0) {
    throw new StyleProfileGenerationError("请先粘贴至少一段代表作。", 400);
  }

  const agent =
    styleAgent ??
    (new Agent({
      id: "tritree-style-profile-agent",
      name: "Tritree Style Profile Agent",
      instructions: STYLE_PROFILE_SYSTEM_PROMPT,
      model: createTreeableAnthropicModel(env)
    }) as unknown as StyleProfileAgentLike);

  const result = await agent.generate(
    [{ role: "user", content: buildStyleProfileUserPrompt(normalizedSamples) }],
    {
      abortSignal: signal,
      structuredOutput: {
        jsonPromptInjection: true,
        schema: StyleProfileOutputSchema
      }
    }
  );

  return normalizeGeneratedStyleDraft(result.object ?? result.output);
}

const STYLE_PROFILE_SYSTEM_PROMPT = `
你是 Tritree 的个人写作风格归纳器。
你的任务是从用户提供的代表作中归纳稳定、可复用、可执行的写作风格，并输出一个可以保存为 Skill 的草稿。
所有可见字段使用简体中文。
不要复制样本文本中的长句。
不要把样本主题、公司、人物或事件当成用户永久偏好。
prompt 要写成明确的写作指令，帮助后续草稿生成保持作者表达习惯。
`.trim();
```

- [ ] **Step 4: Run internal generator tests**

Run:

```bash
npm test -- src/lib/ai/style-profile-generator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/style-profile-generator.ts src/lib/ai/style-profile-generator.test.ts
git commit -m "feat: generate style skills from samples"
```

## Task 3: Style Generation API Routes

**Files:**
- Modify: `src/app/api/skills/route.ts`
- Modify: `src/app/api/skills/route.test.ts`
- Create: `src/app/api/skills/style/generate-from-samples/route.ts`
- Create: `src/app/api/skills/style/generate-external/route.ts`
- Create: `src/app/api/skills/style/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/skills/style/route.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError } from "@/lib/auth/current-user";
import { POST as EXTERNAL_POST } from "./generate-external/route";
import { POST as SAMPLES_POST } from "./generate-from-samples/route";

const mocks = vi.hoisted(() => ({
  fetchExternalStyleProfile: vi.fn(),
  generateStyleFromSamples: vi.fn(),
  requireCurrentUser: vi.fn()
}));

const currentUser = {
  id: "user-1",
  username: "awei",
  displayName: "Awei",
  role: "member",
  isActive: true,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z"
};

const skillDraft = {
  title: "我的风格：克制产品随笔",
  category: "风格",
  description: "短句、具体。",
  prompt: "使用短句，保留具体例子。",
  appliesTo: "writer",
  defaultEnabled: false,
  isArchived: false
};

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/current-user", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/current-user")>("@/lib/auth/current-user");
  return {
    ...actual,
    requireCurrentUser: mocks.requireCurrentUser
  };
});

vi.mock("@/lib/ai/style-profile-generator", () => ({
  generateStyleFromSamples: mocks.generateStyleFromSamples
}));

vi.mock("@/lib/skills/style-profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/skills/style-profile")>("@/lib/skills/style-profile");
  return {
    ...actual,
    fetchExternalStyleProfile: mocks.fetchExternalStyleProfile
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCurrentUser.mockResolvedValue(currentUser);
  mocks.generateStyleFromSamples.mockResolvedValue(skillDraft);
  mocks.fetchExternalStyleProfile.mockResolvedValue(skillDraft);
});

describe("/api/skills/style/generate-from-samples", () => {
  it("requires login", async () => {
    mocks.requireCurrentUser.mockRejectedValue(new AuthApiError(401, "请先登录。"));

    const response = await SAMPLES_POST(new Request("http://test.local/api/skills/style/generate-from-samples", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "请先登录。" });
  });

  it("returns a generated style skill draft without saving it", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: ["第一段代表作。", "第二段代表作。"] })
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.generateStyleFromSamples).toHaveBeenCalledWith({
      samples: ["第一段代表作。", "第二段代表作。"]
    });
    expect(await response.json()).toEqual({ skillDraft });
  });

  it("rejects invalid JSON bodies", async () => {
    const response = await SAMPLES_POST(
      new Request("http://test.local/api/skills/style/generate-from-samples", {
        method: "POST",
        body: JSON.stringify({ samples: [123] })
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.generateStyleFromSamples).not.toHaveBeenCalled();
  });
});

describe("/api/skills/style/generate-external", () => {
  it("uses the current user identity and returns a draft", async () => {
    const response = await EXTERNAL_POST(
      new Request("http://test.local/api/skills/style/generate-external", {
        method: "POST"
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.fetchExternalStyleProfile).toHaveBeenCalledWith({
      user: { id: "user-1", username: "awei", displayName: "Awei" }
    });
    expect(await response.json()).toEqual({ skillDraft });
  });

  it("turns provider errors into public responses", async () => {
    mocks.fetchExternalStyleProfile.mockRejectedValueOnce(Object.assign(new Error("外部风格生成没有配置。"), { status: 503 }));

    const response = await EXTERNAL_POST(new Request("http://test.local/api/skills/style/generate-external", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "外部风格生成没有配置。" });
  });
});
```

Update `src/app/api/skills/route.test.ts` in the `lists skills` test so the mocked repository stays the same and the assertion includes:

```ts
expect(data.styleProfile).toEqual({ externalStyleGenerationAvailable: false });
```

- [ ] **Step 2: Run failing route tests**

Run:

```bash
npm test -- src/app/api/skills/style/route.test.ts src/app/api/skills/route.test.ts
```

Expected: FAIL because the style route files and skills config response do not exist.

- [ ] **Step 3: Add the sample generation route**

Create `src/app/api/skills/style/generate-from-samples/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequestResponse, isBadRequestError } from "@/lib/api/errors";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { generateStyleFromSamples } from "@/lib/ai/style-profile-generator";
import { StyleProfileGenerationError } from "@/lib/skills/style-profile";

export const runtime = "nodejs";

const GenerateFromSamplesBodySchema = z.object({
  samples: z.array(z.string()).default([])
});

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const body = GenerateFromSamplesBodySchema.parse(await request.json());
    const skillDraft = await generateStyleFromSamples({ samples: body.samples });
    return NextResponse.json({ skillDraft });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (isBadRequestError(error)) return badRequestResponse(error);
    if (error instanceof StyleProfileGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "无法生成我的风格。" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Add the external generation route**

Create `src/app/api/skills/style/generate-external/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { authErrorResponse, requireCurrentUser } from "@/lib/auth/current-user";
import { StyleProfileGenerationError, fetchExternalStyleProfile } from "@/lib/skills/style-profile";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const skillDraft = await fetchExternalStyleProfile({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }
    });
    return NextResponse.json({ skillDraft });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof StyleProfileGenerationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "无法生成我的风格。" }, { status: 500 });
  }
}
```

- [ ] **Step 5: Add provider availability to `GET /api/skills`**

Modify `src/app/api/skills/route.ts`:

```ts
import { externalStyleProviderAvailable } from "@/lib/skills/style-profile";
```

Return:

```ts
return NextResponse.json({
  skills: repository.listSkills(user.id),
  creationRequestOptions: repository.listCreationRequestOptions(user.id),
  styleProfile: {
    externalStyleGenerationAvailable: externalStyleProviderAvailable()
  }
});
```

- [ ] **Step 6: Run route tests**

Run:

```bash
npm test -- src/app/api/skills/style/route.test.ts src/app/api/skills/route.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/skills/route.ts src/app/api/skills/route.test.ts src/app/api/skills/style
git commit -m "feat: add style generation api routes"
```

## Task 4: StyleProfileSetup Component

**Files:**
- Create: `src/components/root-memory/StyleProfileSetup.tsx`
- Create: `src/components/root-memory/StyleProfileSetup.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `src/components/root-memory/StyleProfileSetup.test.tsx` with:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/lib/domain";
import { StyleProfileSetup } from "./StyleProfileSetup";

const baseSkill: Skill = {
  id: "style-1",
  title: "我的风格：克制产品随笔",
  category: "风格",
  description: "短句、具体。",
  prompt: "使用短句，保留具体例子。",
  appliesTo: "writer",
  isSystem: false,
  defaultEnabled: false,
  isArchived: false,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z"
};

const generatedDraft = {
  title: "我的风格：自然短句",
  category: "风格",
  description: "更自然的短句表达。",
  prompt: "使用自然短句，减少抽象形容。",
  appliesTo: "writer",
  defaultEnabled: false,
  isArchived: false
};

function renderSetup(props: Partial<ComponentProps<typeof StyleProfileSetup>> = {}) {
  return render(
    <StyleProfileSetup
      disabled={false}
      externalStyleGenerationAvailable={false}
      onCreateSkill={vi.fn(async () => ({ ...generatedDraft, id: "style-new", isSystem: false, createdAt: "", updatedAt: "" }))}
      onSavedSkill={vi.fn()}
      onUpdateSkill={vi.fn(async () => ({ ...baseSkill, ...generatedDraft }))}
      selectedSkillIds={[]}
      skills={[]}
      {...props}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("StyleProfileSetup", () => {
  it("renders expanded when no personal style is selected", () => {
    renderSetup();

    expect(screen.getByRole("region", { name: "我的风格" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "一键生成我的风格" })).not.toBeInTheDocument();
  });

  it("renders collapsed when a selected personal style exists", async () => {
    renderSetup({ selectedSkillIds: ["style-1"], skills: [baseSkill] });

    expect(screen.getByText("正在使用：我的风格：克制产品随笔")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "展开我的风格设置" }));

    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeInTheDocument();
  });

  it("shows one-click generation when the external provider is available", () => {
    renderSetup({ externalStyleGenerationAvailable: true });

    expect(screen.getByRole("button", { name: "一键生成我的风格" })).toBeInTheDocument();
  });

  it("generates from pasted samples and saves a new version", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: generatedDraft })
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      id: "style-new",
      isSystem: false,
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z"
    }));
    const onSavedSkill = vi.fn();

    renderSetup({ onCreateSkill, onSavedSkill });

    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
    await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "第一段代表作。\n\n第二段代表作。");
    await userEvent.click(screen.getByRole("button", { name: "生成风格草稿" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/skills/style/generate-from-samples",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ samples: ["第一段代表作。", "第二段代表作。"] })
      })
    );
    expect(await screen.findByRole("textbox", { name: "风格名称" })).toHaveValue("我的风格：自然短句");

    await userEvent.click(screen.getByRole("button", { name: "保存并用于本作品" }));

    expect(onCreateSkill).toHaveBeenCalledWith(generatedDraft);
    expect(onSavedSkill).toHaveBeenCalledWith(expect.objectContaining({ id: "style-new" }));
  });

  it("generates from external provider and updates an existing style", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: generatedDraft })
    });
    vi.stubGlobal("fetch", fetchMock);
    const onUpdateSkill = vi.fn(async () => ({ ...baseSkill, ...generatedDraft }));
    const onSavedSkill = vi.fn();

    renderSetup({
      externalStyleGenerationAvailable: true,
      onSavedSkill,
      onUpdateSkill,
      selectedSkillIds: ["style-1"],
      skills: [baseSkill]
    });

    await userEvent.click(screen.getByRole("button", { name: "展开我的风格设置" }));
    await userEvent.click(screen.getByRole("button", { name: "一键生成我的风格" }));
    await screen.findByRole("textbox", { name: "风格名称" });
    await userEvent.click(screen.getByRole("radio", { name: "更新已有风格" }));
    await userEvent.click(screen.getByRole("button", { name: "保存并用于本作品" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/skills/style/generate-external",
      expect.objectContaining({ method: "POST" })
    );
    expect(onUpdateSkill).toHaveBeenCalledWith("style-1", generatedDraft);
    expect(onSavedSkill).toHaveBeenCalledWith(expect.objectContaining({ id: "style-1" }));
  });

  it("preserves input and offers recovery after generation failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "样本太少，请再贴一段。" })
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSetup();

    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
    await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "只有一句。");
    await userEvent.click(screen.getByRole("button", { name: "生成风格草稿" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("样本太少，请再贴一段。");
    expect(screen.getByRole("textbox", { name: "代表作样本" })).toHaveValue("只有一句。");
    expect(screen.getByRole("button", { name: "重试生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "改为手动创建" })).toBeInTheDocument();
  });

  it("lets the user edit the generated draft before saving", async () => {
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      title: "我的风格：产品观察",
      id: "style-new",
      isSystem: false,
      createdAt: "",
      updatedAt: ""
    }));

    renderSetup({ onCreateSkill });
    await userEvent.click(screen.getByRole("button", { name: "改为手动创建" }));
    await userEvent.type(screen.getByRole("textbox", { name: "风格名称" }), "产品观察");
    await userEvent.type(screen.getByRole("textbox", { name: "风格说明" }), "具体、克制。");
    await userEvent.type(screen.getByRole("textbox", { name: "风格提示词" }), "写作时具体、克制。");
    await userEvent.click(screen.getByRole("button", { name: "保存并用于本作品" }));

    await waitFor(() =>
      expect(onCreateSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "我的风格：产品观察",
          description: "具体、克制。",
          prompt: "写作时具体、克制。"
        })
      )
    );
  });
});
```

- [ ] **Step 2: Run the failing component tests**

Run:

```bash
npm test -- src/components/root-memory/StyleProfileSetup.test.tsx
```

Expected: FAIL because `StyleProfileSetup.tsx` does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/root-memory/StyleProfileSetup.tsx` with the following structure:

```tsx
"use client";

import { useMemo, useState } from "react";
import { MAX_SKILL_PROMPT_LENGTH, type Skill, type SkillUpsert } from "@/lib/domain";
import {
  MY_STYLE_TITLE_PREFIX,
  isPersonalStyleSkill,
  normalizeGeneratedStyleDraft,
  splitRepresentativeSamples
} from "@/lib/skills/style-profile";

type GenerationMode = "external" | "samples";
type SaveMode = "create" | "update";

const emptyStyleDraft: SkillUpsert = {
  title: MY_STYLE_TITLE_PREFIX,
  category: "风格",
  description: "",
  prompt: "",
  appliesTo: "writer",
  defaultEnabled: false,
  isArchived: false
};

export function StyleProfileSetup({
  disabled,
  externalStyleGenerationAvailable,
  onCreateSkill,
  onSavedSkill,
  onUpdateSkill,
  selectedSkillIds,
  skills
}: {
  disabled: boolean;
  externalStyleGenerationAvailable: boolean;
  onCreateSkill: (input: SkillUpsert) => Promise<Skill | null>;
  onSavedSkill: (skill: Skill) => void;
  onUpdateSkill: (skillId: string, input: SkillUpsert) => Promise<Skill | null>;
  selectedSkillIds: string[];
  skills: Skill[];
}) {
  const personalStyleSkills = useMemo(() => skills.filter(isPersonalStyleSkill), [skills]);
  const selectedPersonalStyle = personalStyleSkills.find((skill) => selectedSkillIds.includes(skill.id)) ?? null;
  const [isExpanded, setIsExpanded] = useState(!selectedPersonalStyle);
  const [samplesText, setSamplesText] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("samples");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SkillUpsert | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>(selectedPersonalStyle ? "update" : "create");
  const [updateSkillId, setUpdateSkillId] = useState(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
  const isBusy = disabled || isGenerating || isSaving;

  async function generateFromSamples() {
    const samples = splitRepresentativeSamples(samplesText);
    if (samples.length === 0) {
      setError("请先粘贴至少一段代表作。");
      return;
    }

    await requestGeneration("samples", "/api/skills/style/generate-from-samples", { samples });
  }

  async function generateExternal() {
    await requestGeneration("external", "/api/skills/style/generate-external");
  }

  async function requestGeneration(mode: GenerationMode, url: string, body?: unknown) {
    setError("");
    setGenerationMode(mode);
    setIsGenerating(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const data = (await response.json()) as { error?: string; skillDraft?: unknown };
      if (!response.ok || !data.skillDraft) throw new Error(data.error ?? "无法生成我的风格。");
      setDraft(normalizeGeneratedStyleDraft(data.skillDraft));
      setSaveMode(selectedPersonalStyle ? "update" : "create");
      setUpdateSkillId(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法生成我的风格。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    const normalizedDraft = normalizeGeneratedStyleDraft(draft);
    setError("");
    setIsSaving(true);
    try {
      const savedSkill =
        saveMode === "update" && updateSkillId
          ? await onUpdateSkill(updateSkillId, normalizedDraft)
          : await onCreateSkill(normalizedDraft);
      if (!savedSkill) throw new Error("技能保存失败。");
      onSavedSkill(savedSkill);
      setIsExpanded(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "技能保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  function startManualDraft() {
    setError("");
    setDraft(emptyStyleDraft);
    setSaveMode(selectedPersonalStyle ? "update" : "create");
  }

  return (
    <section aria-label="我的风格" className={`style-profile-setup${isExpanded ? " style-profile-setup--expanded" : ""}`}>
      <header className="style-profile-setup__header">
        <div>
          <p className="eyebrow">我的风格</p>
          {selectedPersonalStyle && !isExpanded ? (
            <p className="style-profile-setup__summary">正在使用：{selectedPersonalStyle.title}</p>
          ) : (
            <p className="style-profile-setup__summary">生成个人风格 Skill，并自动用于这次作品。</p>
          )}
        </div>
        <button
          aria-expanded={isExpanded}
          className="secondary-button"
          disabled={disabled}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          type="button"
        >
          {isExpanded ? "收起我的风格设置" : "展开我的风格设置"}
        </button>
      </header>

      {isExpanded ? (
        <div className="style-profile-setup__body">
          {error ? (
            <p className="style-profile-setup__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="style-profile-setup__actions">
            {externalStyleGenerationAvailable ? (
              <button className="primary-action" disabled={isBusy} onClick={() => void generateExternal()} type="button">
                {isGenerating && generationMode === "external" ? "正在一键生成..." : "一键生成我的风格"}
              </button>
            ) : null}
            <button className="secondary-button" disabled={isBusy} onClick={() => setGenerationMode("samples")} type="button">
              粘贴代表作生成
            </button>
            <button className="secondary-button" disabled={isBusy} onClick={startManualDraft} type="button">
              改为手动创建
            </button>
          </div>

          {generationMode === "samples" ? (
            <label className="style-profile-setup__samples">
              <span>代表作样本</span>
              <textarea
                aria-label="代表作样本"
                disabled={isBusy}
                onChange={(event) => setSamplesText(event.target.value)}
                placeholder={"粘贴几段最像你的作品。用空行分隔多段样本。"}
                rows={5}
                value={samplesText}
              />
            </label>
          ) : null}

          <div className="style-profile-setup__generate-row">
            <button className="secondary-button" disabled={isBusy} onClick={() => void generateFromSamples()} type="button">
              {isGenerating && generationMode === "samples" ? "正在生成..." : error ? "重试生成" : "生成风格草稿"}
            </button>
          </div>

          {draft ? (
            <section aria-label="风格草稿" className="style-profile-review">
              <label>
                <span>风格名称</span>
                <input
                  aria-label="风格名称"
                  disabled={isBusy}
                  maxLength={40}
                  onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                  value={draft.title}
                />
              </label>
              <label>
                <span>风格说明</span>
                <textarea
                  aria-label="风格说明"
                  disabled={isBusy}
                  maxLength={240}
                  onChange={(event) => setDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                  rows={2}
                  value={draft.description}
                />
              </label>
              <label>
                <span>风格提示词</span>
                <textarea
                  aria-label="风格提示词"
                  disabled={isBusy}
                  maxLength={MAX_SKILL_PROMPT_LENGTH}
                  onChange={(event) => setDraft((current) => (current ? { ...current, prompt: event.target.value } : current))}
                  rows={5}
                  value={draft.prompt}
                />
              </label>
              {personalStyleSkills.length > 0 ? (
                <fieldset className="style-profile-review__save-mode">
                  <legend>保存方式</legend>
                  <label>
                    <input
                      checked={saveMode === "update"}
                      disabled={isBusy}
                      name="style-save-mode"
                      onChange={() => setSaveMode("update")}
                      type="radio"
                    />
                    <span>更新已有风格</span>
                  </label>
                  <label>
                    <input
                      checked={saveMode === "create"}
                      disabled={isBusy}
                      name="style-save-mode"
                      onChange={() => setSaveMode("create")}
                      type="radio"
                    />
                    <span>创建新版本</span>
                  </label>
                  {saveMode === "update" ? (
                    <select
                      aria-label="选择要更新的风格"
                      disabled={isBusy}
                      onChange={(event) => setUpdateSkillId(event.target.value)}
                      value={updateSkillId}
                    >
                      {personalStyleSkills.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </fieldset>
              ) : null}
              <button className="primary-action" disabled={isBusy || !draft.title.trim() || !draft.prompt.trim()} onClick={() => void saveDraft()} type="button">
                {isSaving ? "正在保存..." : "保存并用于本作品"}
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npm test -- src/components/root-memory/StyleProfileSetup.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/root-memory/StyleProfileSetup.tsx src/components/root-memory/StyleProfileSetup.test.tsx
git commit -m "feat: add my style setup component"
```

## Task 5: Seed Screen Integration

**Files:**
- Modify: `src/components/root-memory/RootMemorySetup.tsx`
- Modify: `src/components/root-memory/RootMemorySetup.test.tsx`
- Modify: `src/components/TreeableApp.tsx`
- Modify: `src/components/TreeableApp.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Add this test to `src/components/root-memory/RootMemorySetup.test.tsx`:

```tsx
it("adds a saved personal style to the enabled skills for the new work", async () => {
  const onSubmit = vi.fn();
  const personalStyle: Skill = {
    id: "style-new",
    title: "我的风格：自然短句",
    category: "风格",
    description: "短句。",
    prompt: "使用短句。",
    appliesTo: "writer",
    isSystem: false,
    defaultEnabled: false,
    isArchived: false,
    createdAt: "2026-05-13T00:00:00.000Z",
    updatedAt: "2026-05-13T00:00:00.000Z"
  };
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      skillDraft: {
        title: "我的风格：自然短句",
        category: "风格",
        description: "短句。",
        prompt: "使用短句。",
        appliesTo: "writer",
        defaultEnabled: false,
        isArchived: false
      }
    })
  });
  vi.stubGlobal("fetch", fetchMock);

  renderRootMemorySetup({
    onCreateSkill: vi.fn(async () => personalStyle),
    onSubmit,
    styleProfileExternalAvailable: false
  });

  await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
  await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "第一段代表作。");
  await userEvent.click(screen.getByRole("button", { name: "生成风格草稿" }));
  await userEvent.click(await screen.findByRole("button", { name: "保存并用于本作品" }));
  await userEvent.type(screen.getByRole("textbox", { name: "创作 seed" }), "一个新念头");
  await userEvent.click(screen.getByRole("button", { name: "用这个念头开始" }));

  expect(onSubmit).toHaveBeenCalledWith({
    preferences: expect.objectContaining({ seed: "一个新念头" }),
    enabledSkillIds: ["system-analysis", "style-new"]
  });
});
```

In `src/app/api/skills/route.test.ts`, keep the `styleProfile` assertion from Task 3.

- [ ] **Step 2: Run failing integration tests**

Run:

```bash
npm test -- src/components/root-memory/RootMemorySetup.test.tsx src/app/api/skills/route.test.ts
```

Expected: FAIL because `RootMemorySetup` does not accept style-profile props or render `StyleProfileSetup`.

- [ ] **Step 3: Update `RootMemorySetup` props and render the workbench**

Modify `src/components/root-memory/RootMemorySetup.tsx`:

Add import:

```ts
import { StyleProfileSetup } from "@/components/root-memory/StyleProfileSetup";
```

Add props:

```ts
  onCreateSkill?: (input: SkillUpsert) => Promise<Skill | null>;
  onUpdateSkill?: (skillId: string, input: SkillUpsert) => Promise<Skill | null>;
  styleProfileExternalAvailable?: boolean;
```

Add `SkillUpsert` to the existing domain import:

```ts
type SkillUpsert
```

Add this helper inside the component:

```ts
  function handleSavedStyleSkill(skill: Skill) {
    setSelectedSkillIds((current) => (current.includes(skill.id) ? current : [...current, skill.id]));
  }
```

Render `StyleProfileSetup` after the seed textarea and before `本次创作要求`:

```tsx
        {onCreateSkill && onUpdateSkill ? (
          <StyleProfileSetup
            disabled={isSaving}
            externalStyleGenerationAvailable={Boolean(styleProfileExternalAvailable)}
            onCreateSkill={onCreateSkill}
            onSavedSkill={handleSavedStyleSkill}
            onUpdateSkill={onUpdateSkill}
            selectedSkillIds={selectedSkillIds}
            skills={skills}
          />
        ) : null}
```

- [ ] **Step 4: Update `TreeableApp` skills loading and callbacks**

Modify `src/components/TreeableApp.tsx`.

Add state:

```ts
  const [isExternalStyleGenerationAvailable, setIsExternalStyleGenerationAvailable] = useState(false);
```

Extend `skillsData` type in `loadRoot`:

```ts
        styleProfile?: { externalStyleGenerationAvailable?: boolean };
```

After setting creation request options:

```ts
      setIsExternalStyleGenerationAvailable(Boolean(skillsData.styleProfile?.externalStyleGenerationAvailable));
```

Change `createLibrarySkill` success return:

```ts
      setSkills((current) => [...current, data.skill!]);
      return data.skill;
```

Keep existing callers working by changing the `SkillLibraryPanel` prop:

```tsx
            onCreate={async (input) => Boolean(await createLibrarySkill(input))}
```

Pass style props into `RootMemorySetup`:

```tsx
          onCreateSkill={createLibrarySkill}
          onUpdateSkill={updateLibrarySkill}
          styleProfileExternalAvailable={isExternalStyleGenerationAvailable}
```

- [ ] **Step 5: Run integration tests**

Run:

```bash
npm test -- src/components/root-memory/RootMemorySetup.test.tsx src/components/TreeableApp.test.tsx src/app/api/skills/route.test.ts
```

Expected: PASS. If `TreeableApp.test.tsx` mocked `/api/skills`, update that mock response to include:

```ts
styleProfile: { externalStyleGenerationAvailable: false }
```

- [ ] **Step 6: Commit**

```bash
git add src/components/root-memory/RootMemorySetup.tsx src/components/root-memory/RootMemorySetup.test.tsx src/components/TreeableApp.tsx src/components/TreeableApp.test.tsx
git commit -m "feat: wire my style setup into seed flow"
```

## Task 6: Styling, Full Verification, and Cleanup

**Files:**
- Modify: `src/app/globals.css`
- Review: all files changed by Tasks 1-5

- [ ] **Step 1: Add focused CSS for the workbench**

Append near the existing `.root-setup__skills` styles in `src/app/globals.css`:

```css
.style-profile-setup {
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.82);
  padding: 16px;
}

.style-profile-setup--expanded {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
}

.style-profile-setup__header,
.style-profile-setup__actions,
.style-profile-setup__generate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.style-profile-setup__summary {
  color: #64748b;
  font-size: 0.9rem;
  margin: 4px 0 0;
}

.style-profile-setup__body {
  display: grid;
  gap: 14px;
  margin-top: 14px;
}

.style-profile-setup__actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.style-profile-setup__samples,
.style-profile-review label {
  display: grid;
  gap: 7px;
}

.style-profile-setup__samples span,
.style-profile-review label span,
.style-profile-review__save-mode legend {
  color: #334155;
  font-size: 0.86rem;
  font-weight: 700;
}

.style-profile-setup__samples textarea,
.style-profile-review input,
.style-profile-review select,
.style-profile-review textarea {
  border: 1px solid rgba(148, 163, 184, 0.6);
  border-radius: 8px;
  color: #0f172a;
  font: inherit;
  padding: 10px 12px;
}

.style-profile-review {
  border-top: 1px solid rgba(148, 163, 184, 0.24);
  display: grid;
  gap: 12px;
  padding-top: 14px;
}

.style-profile-review__save-mode {
  border: 1px solid rgba(148, 163, 184, 0.36);
  border-radius: 8px;
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 12px;
}

.style-profile-review__save-mode label {
  align-items: center;
  display: flex;
  gap: 8px;
}

.style-profile-setup__error {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  border-radius: 8px;
  color: #be123c;
  margin: 0;
  padding: 10px 12px;
}
```

Add this inside the existing mobile media block that already adjusts root setup controls:

```css
  .style-profile-setup__header,
  .style-profile-setup__actions,
  .style-profile-setup__generate-row {
    align-items: stretch;
    flex-direction: column;
  }
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
npm test -- src/lib/skills/style-profile.test.ts src/lib/ai/style-profile-generator.test.ts src/app/api/skills/style/route.test.ts src/app/api/skills/route.test.ts src/components/root-memory/StyleProfileSetup.test.tsx src/components/root-memory/RootMemorySetup.test.tsx src/components/TreeableApp.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Review git diff for accidental changes**

Run:

```bash
git status --short
git diff --stat
git diff --check
```

Expected:

- `git status --short` only lists files from this plan.
- `git diff --check` exits 0 with no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/skills/style-profile.ts src/lib/skills/style-profile.test.ts src/lib/ai/style-profile-generator.ts src/lib/ai/style-profile-generator.test.ts src/app/api/skills/route.ts src/app/api/skills/route.test.ts src/app/api/skills/style src/components/root-memory/StyleProfileSetup.tsx src/components/root-memory/StyleProfileSetup.test.tsx src/components/root-memory/RootMemorySetup.tsx src/components/root-memory/RootMemorySetup.test.tsx src/components/TreeableApp.tsx src/components/TreeableApp.test.tsx src/app/globals.css
git commit -m "feat: add my style skill generation"
```

## Plan Self-Review

Spec coverage:

- First-class Seed-screen workbench: Task 4 creates `StyleProfileSetup`; Task 5 renders it inside `RootMemorySetup`.
- Pasted samples: Task 2 implements internal generation; Task 3 exposes the API; Task 4 covers UI.
- External one-click provider: Task 1 implements provider availability and fetch; Task 3 exposes route/config; Task 4 conditionally renders the button.
- Editable review: Task 4 implements controlled title, description, and prompt inputs.
- Save as normal skill: Task 5 reuses `createLibrarySkill` and `updateLibrarySkill`.
- Auto-enable current work: Task 5 updates `selectedSkillIds`.
- Update existing or create version: Task 4 implements save mode and tests both paths.
- No metadata/schema change: no database or schema migration tasks are included.
- Multi-user isolation: Task 3 routes use `requireCurrentUser`; external route sends current user only.
- Failure recovery: Task 4 preserves sample input and shows retry/manual creation.

Red-flag scan:

- This plan intentionally avoids unresolved markers and gives concrete file paths, commands, and code snippets for every code task.

Type consistency:

- `SkillUpsert`, `Skill`, `StyleProfileGenerationError`, `normalizeGeneratedStyleDraft`, `externalStyleProviderAvailable`, and `fetchExternalStyleProfile` are introduced before later tasks depend on them.
- `onCreateSkill` and `onUpdateSkill` return `Promise<Skill | null>` consistently across `StyleProfileSetup`, `RootMemorySetup`, and `TreeableApp`.
