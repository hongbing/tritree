import { z } from "zod";
import { ArtifactTypeIdSchema, InspirationSchema, type ArtifactTypeId, type Inspiration } from "@/lib/domain";

export const INSPIRATION_URL_ENV = "TRITREE_INSPIRATION_URL";
export const INSPIRATION_TOKEN_ENV = "TRITREE_INSPIRATION_TOKEN";
export const MOCK_INSPIRATIONS_ENV = "TRITREE_MOCK_INSPIRATIONS";

type FetchLike = typeof fetch;

const InspirationEnvelopeSchema = z.object({
  inspirations: z.array(z.unknown())
});

const MOCK_INSPIRATIONS: Inspiration[] = [
  {
    id: "mock-ai-product-manager",
    title: "AI 产品经理的真实困境",
    detail: "我想写 AI 产品经理在真实项目里的困境：大家以为是在接入模型，其实大多数时间都在处理边界、预期和组织协作。",
    artifactTypeIds: ["social-post"]
  },
  {
    id: "mock-team-writing",
    title: "团队写作规范",
    detail: "我想写一份团队内容写作规范，帮助大家把经验讲清楚，少用口号，多写场景、判断和取舍。",
    artifactTypeIds: ["social-post"]
  },
  {
    id: "mock-prd-decision",
    title: "PRD 里的取舍",
    detail: "我想沉淀一个产品需求决策：为什么这个版本先做最小闭环，而不是一次性补齐所有高级能力。",
    artifactTypeIds: ["prd"]
  },
  {
    id: "mock-prd-scope",
    title: "PRD 的范围边界",
    detail: "我想写一个 PRD 的范围边界：这个版本明确不做哪些能力，以及为什么这些不做反而能帮助团队更快验证。",
    artifactTypeIds: ["prd"]
  },
  {
    id: "mock-social-launch",
    title: "一次产品发布复盘",
    detail: "我想写一次产品发布复盘：真正困难的不是上线那一天，而是上线前每个人对成功标准的理解都不一样。",
    artifactTypeIds: ["social-post"]
  }
];

export class InspirationProviderError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "InspirationProviderError";
  }
}

export class ExternalInspirationProviderUnavailableError extends InspirationProviderError {
  constructor() {
    super("灵感接口没有配置。", 503);
    this.name = "ExternalInspirationProviderUnavailableError";
  }
}

export function externalInspirationProviderAvailable(env: Record<string, string | undefined> = process.env) {
  return isTruthy(env[MOCK_INSPIRATIONS_ENV]) || Boolean(env[INSPIRATION_URL_ENV]?.trim());
}

export async function fetchExternalInspirations({
  artifactTypeId,
  env = process.env,
  fetchImpl = fetch
}: {
  artifactTypeId?: ArtifactTypeId | string | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
} = {}): Promise<Inspiration[]> {
  const parsedArtifactTypeId = ArtifactTypeIdSchema.safeParse(artifactTypeId);
  const selectedArtifactTypeId = parsedArtifactTypeId.success ? parsedArtifactTypeId.data : null;
  if (isTruthy(env[MOCK_INSPIRATIONS_ENV])) return filterInspirationsByArtifactType(MOCK_INSPIRATIONS, selectedArtifactTypeId);

  const url = env[INSPIRATION_URL_ENV]?.trim();
  if (!url) throw new ExternalInspirationProviderUnavailableError();

  const token = env[INSPIRATION_TOKEN_ENV]?.trim();
  const response = await fetchImpl(withArtifactTypeQuery(url, selectedArtifactTypeId), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new InspirationProviderError("灵感接口认证失败，请检查配置。", response.status);
    }
    throw new InspirationProviderError("灵感接口暂时不可用。", 502);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new InspirationProviderError("灵感接口返回格式不完整。", 502);
  }

  const parsed = InspirationEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    throw new InspirationProviderError("灵感接口返回格式不完整。", 502);
  }

  const inspirations = parsed.data.inspirations.flatMap((item) => {
    const parsedItem = InspirationSchema.safeParse(item);
    return parsedItem.success ? [parsedItem.data] : [];
  });

  return filterInspirationsByArtifactType(inspirations, selectedArtifactTypeId);
}

function isTruthy(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function withArtifactTypeQuery(url: string, artifactTypeId: ArtifactTypeId | null) {
  if (!artifactTypeId) return url;
  const parsed = new URL(url);
  parsed.searchParams.set("artifactTypeId", artifactTypeId);
  return parsed.toString();
}

function filterInspirationsByArtifactType(inspirations: Inspiration[], artifactTypeId: ArtifactTypeId | null) {
  if (!artifactTypeId) return inspirations;
  return inspirations.filter((inspiration) => {
    if (inspiration.artifactTypeIds?.length) return inspiration.artifactTypeIds.includes(artifactTypeId);
    if (inspiration.artifactTypeId) return inspiration.artifactTypeId === artifactTypeId;
    return true;
  });
}
