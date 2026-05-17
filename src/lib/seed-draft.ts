import type { Draft } from "@/lib/domain";

export const SEED_DRAFT_PLACEHOLDER_TITLE = "种子念头";

export function createSeedDraft(seed: string): Draft {
  return {
    title: deriveSeedTitle(seed),
    body: seed,
    hashtags: [],
    imagePrompt: ""
  };
}

export function isSeedDraft(draft: Draft | null | undefined, seed: string) {
  const normalizedSeed = normalizeSeedText(seed);
  if (!draft || !normalizedSeed) return false;

  const normalizedBody = normalizeSeedText(draft.body);
  const normalizedTitle = draft.title.trim();
  return (
    normalizedBody === normalizedSeed &&
    draft.hashtags.length === 0 &&
    draft.imagePrompt.trim().length === 0 &&
    (!normalizedTitle || normalizedTitle === deriveSeedTitle(seed))
  );
}

export function resolveDraftTitle(title: string | undefined, body: string | undefined) {
  const trimmedTitle = title?.trim();
  if (trimmedTitle && trimmedTitle !== SEED_DRAFT_PLACEHOLDER_TITLE) return trimmedTitle;
  return deriveSeedTitle(body ?? "");
}

export function deriveSeedTitle(seed: string) {
  const normalized = seed.replace(/\s+/g, " ").trim();
  const [firstSegment = normalized] = normalized.split(/[。！？!?，,；;：:\n]/);
  const title = firstSegment.trim() || normalized;
  return Array.from(title).slice(0, 24).join("") || "未命名草稿";
}

function normalizeSeedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
