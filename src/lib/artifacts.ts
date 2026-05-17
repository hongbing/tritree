import {
  ArtifactTypeIdSchema,
  DEFAULT_ARTIFACT_TYPE_ID,
  type ArtifactTypeId,
  type Draft
} from "@/lib/domain";
import { resolveDraftTitle } from "@/lib/seed-draft";

export { DEFAULT_ARTIFACT_TYPE_ID };

export type PublishPlatform = "weibo" | "xiaohongshu" | "moments";

export const ALL_PUBLISH_PLATFORMS: PublishPlatform[] = ["weibo", "xiaohongshu", "moments"];

export const PUBLISH_PLATFORMS_ENV = "TRITREE_PUBLISH_PLATFORMS";

export type ArtifactCheck = {
  text: string;
  tone: "neutral" | "ok" | "warn";
};

export type ArtifactDelivery = {
  checks: ArtifactCheck[];
  copyLabel: string;
  text: string;
  textLabel: string;
  title: string;
};

export type ArtifactType = {
  actionCopy: string;
  actionDialogLabel: string;
  actionDialogTitle: string;
  actionLabel: string;
  bodyLabel: string;
  description: string;
  draftInstructions: string;
  historyPanelTitle: string;
  id: ArtifactTypeId;
  label: string;
  optionInstructions: string;
  publishPlatforms: PublishPlatform[];
  showImagePrompt: boolean;
  showPublishAssistant: boolean;
  showTopics: boolean;
  titleLabel: string;
  currentPanelTitle: string;
};

const PRD_REQUIRED_SECTIONS = ["背景", "目标", "非目标", "用户", "需求", "指标", "风险", "待确认"];

const ARTIFACT_TYPES = [
  {
    id: "social-post",
    label: "社媒内容",
    description: "微博、小红书、朋友圈等社交媒体草稿。",
    currentPanelTitle: "实时草稿",
    historyPanelTitle: "历史草稿",
    titleLabel: "标题",
    bodyLabel: "正文",
    actionLabel: "发布",
    actionDialogLabel: "发布助手",
    actionDialogTitle: "发布助手",
    actionCopy: "生成适合平台的复制版本",
    publishPlatforms: ALL_PUBLISH_PLATFORMS,
    showTopics: true,
    showImagePrompt: true,
    showPublishAssistant: true,
    draftInstructions:
      "作品类型：社媒内容。输出 artifact.type=\"social-post\"。artifact.payload.title 是可选标题，artifact.payload.body 是正文，artifact.payload.hashtags 是话题数组，artifact.payload.imagePrompt 是可选配图提示。",
    optionInstructions:
      "澄清问题和三个答案应该围绕社交媒体表达决策，例如读者、角度、故事、观点、结构、压缩、标题、话题或发布前收口。"
  },
  {
    id: "prd",
    label: "PRD 文档",
    description: "产品需求文档，用章节沉淀背景、目标、需求和风险。",
    currentPanelTitle: "实时 PRD",
    historyPanelTitle: "历史 PRD",
    titleLabel: "文档标题",
    bodyLabel: "PRD 内容",
    actionLabel: "交付",
    actionDialogLabel: "交付助手",
    actionDialogTitle: "PRD 交付稿",
    actionCopy: "复制 Markdown 前检查章节完整性。",
    publishPlatforms: [],
    showTopics: false,
    showImagePrompt: false,
    showPublishAssistant: false,
    draftInstructions: [
      "作品类型：PRD 文档。",
      "输出 artifact.type=\"prd\"。",
      "artifact.payload.title 必须是清楚的 PRD 文档标题。",
      "artifact.payload.markdown 必须使用 Markdown 章节组织，优先包含：背景、目标、非目标、用户、需求、指标、风险、待确认。",
      "需求章节要写成可执行的产品需求，可以包含列表、验收标准或优先级。",
      "不要生成社交媒体话题或配图提示。"
    ].join("\n"),
    optionInstructions:
      "澄清问题和三个答案应该围绕 PRD 决策，例如补背景、收目标、明确非目标、拆需求、补指标、识别风险、列待确认问题或调整面向决策者的结构。"
  }
] satisfies ArtifactType[];

const artifactTypeById = new Map(ARTIFACT_TYPES.map((artifactType) => [artifactType.id, artifactType]));
export const ARTIFACT_TYPES_ENV = "TRITREE_ARTIFACT_TYPES";

export function listArtifactTypes() {
  return ARTIFACT_TYPES;
}

export function listConfiguredArtifactTypes(env: Record<string, string | undefined> = process.env): ArtifactType[] {
  const configured = env[ARTIFACT_TYPES_ENV]?.trim();

  if (!configured || configured.toLowerCase() === "all") return ARTIFACT_TYPES;

  const selectedTypes = configured
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const parsed = ArtifactTypeIdSchema.safeParse(part);
      const artifactType = parsed.success ? artifactTypeById.get(parsed.data) : undefined;
      return artifactType ? [artifactType] : [];
    });

  return selectedTypes.length > 0 ? selectedTypes : ARTIFACT_TYPES;
}

export function listConfiguredPublishPlatforms(env: Record<string, string | undefined> = process.env): PublishPlatform[] {
  const configured = env[PUBLISH_PLATFORMS_ENV]?.trim();

  if (!configured || configured.toLowerCase() === "all") return ALL_PUBLISH_PLATFORMS;

  const validPlatforms = new Set<string>(ALL_PUBLISH_PLATFORMS);
  const selectedPlatforms = configured
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part): part is PublishPlatform => validPlatforms.has(part));

  return selectedPlatforms.length > 0 ? selectedPlatforms : ALL_PUBLISH_PLATFORMS;
}

export function getArtifactType(typeId: string | null | undefined): ArtifactType {
  const parsed = ArtifactTypeIdSchema.safeParse(typeId);
  const base = artifactTypeById.get(parsed.success ? parsed.data : DEFAULT_ARTIFACT_TYPE_ID) ?? ARTIFACT_TYPES[0];
  if (!base.showPublishAssistant) return base;

  const platforms = listConfiguredPublishPlatforms();
  if (platforms.length === ALL_PUBLISH_PLATFORMS.length && platforms.every((p, i) => p === ALL_PUBLISH_PLATFORMS[i])) {
    return base;
  }
  return { ...base, publishPlatforms: platforms };
}

export function formatArtifactInstructionsForDirector(typeId: string | null | undefined) {
  const artifactType = getArtifactType(typeId);
  return [artifactType.draftInstructions, artifactType.optionInstructions].join("\n");
}

export function buildArtifactDelivery(typeId: string | null | undefined, draft: Draft): ArtifactDelivery {
  const artifactType = getArtifactType(typeId);
  if (artifactType.id === "prd") {
    return {
      title: "PRD 交付稿",
      textLabel: "PRD Markdown",
      copyLabel: "复制 PRD Markdown",
      text: formatPrdMarkdown(draft),
      checks: buildPrdChecks(draft)
    };
  }

  return {
    title: artifactType.actionDialogTitle,
    textLabel: "正文",
    copyLabel: "复制正文",
    text: draft.body,
    checks: [{ text: draft.body.trim() ? "正文已生成" : "缺少正文", tone: draft.body.trim() ? "ok" : "warn" }]
  };
}

function formatPrdMarkdown(draft: Draft) {
  const title = resolveDraftTitle(draft.title, draft.body).trim();
  const body = draft.body.trim();
  if (!title) return body;
  if (!body) return `# ${title}`;
  return [`# ${title}`, body].join("\n\n");
}

function buildPrdChecks(draft: Draft): ArtifactCheck[] {
  const body = draft.body.trim();
  const checks: ArtifactCheck[] = [
    { text: draft.title.trim() ? "文档标题已生成" : "缺少文档标题", tone: draft.title.trim() ? "ok" : "warn" },
    { text: body ? `正文约 ${Array.from(body).length} 字` : "缺少正文", tone: body ? "neutral" : "warn" }
  ];

  for (const section of PRD_REQUIRED_SECTIONS) {
    checks.push({
      text: `${hasMarkdownSection(body, section) ? "已包含" : "缺少"}：${section}`,
      tone: hasMarkdownSection(body, section) ? "ok" : "warn"
    });
  }

  return checks;
}

function hasMarkdownSection(body: string, section: string) {
  const pattern = new RegExp(`(^|\\n)#{1,6}\\s*${escapeRegExp(section)}(?:\\s|$|[：:])`);
  return pattern.test(body);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
