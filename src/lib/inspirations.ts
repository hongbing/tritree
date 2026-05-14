import { z } from "zod";
import { ArtifactTypeIdSchema, InspirationSchema, type ArtifactTypeId, type Inspiration } from "@/lib/domain";
import { loadConfiguredDefaults } from "@/lib/defaults";

export const INSPIRATION_URL_ENV = "TRITREE_INSPIRATION_URL";
export const INSPIRATION_TOKEN_ENV = "TRITREE_INSPIRATION_TOKEN";

type FetchLike = typeof fetch;

const InspirationEnvelopeSchema = z.object({
  inspirations: z.array(z.unknown())
});

export class InspirationProviderError extends Error {
  constructor(
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "InspirationProviderError";
  }
}

export function externalInspirationProviderAvailable(env: Record<string, string | undefined> = process.env) {
  return Boolean(env[INSPIRATION_URL_ENV]?.trim());
}

export async function fetchExternalInspirations({
  artifactTypeId,
  env = process.env,
  fetchImpl = fetch,
  defaultsConfigPath
}: {
  artifactTypeId?: ArtifactTypeId | string | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  defaultsConfigPath?: string;
} = {}): Promise<Inspiration[]> {
  const parsedArtifactTypeId = ArtifactTypeIdSchema.safeParse(artifactTypeId);
  const selectedArtifactTypeId = parsedArtifactTypeId.success ? parsedArtifactTypeId.data : null;

  const url = env[INSPIRATION_URL_ENV]?.trim();
  if (!url) {
    const defaults = loadConfiguredDefaults({ configPath: defaultsConfigPath, env });
    return filterInspirationsByArtifactType(defaults.inspirations, selectedArtifactTypeId);
  }

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
