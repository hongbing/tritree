import {
  SkillSchema,
  skillsForTarget,
  DEFAULT_ARTIFACT_TYPE_ID,
  type Artifact,
  type BranchOption,
  type OptionGenerationMode,
  type SessionState
} from "@/lib/domain";
import type { DirectorInputParts, DirectorMessage } from "@/lib/ai/prompts";
import { formatArtifactInstructionsForDirector } from "@/lib/artifacts";
import { getArtifactPlugin } from "@/artifacts/registry";

export function summarizeSessionForDirector(
  state: SessionState,
  selectedOption?: BranchOption,
  selectedOptionNote?: string,
  optionMode: OptionGenerationMode = "balanced"
): DirectorInputParts {
  const trimmedNote = selectedOptionNote?.trim();
  const modeHint = formatArtifactDirectionRangeHint(optionMode);
  const selectedOptionLabel = formatWritingIntentLabel(selectedOption, trimmedNote, modeHint);
  const currentArtifact = currentArtifactForState(state);

  return {
    artifactContext: artifactContextForState(state),
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    currentArtifact: formatArtifactForDirector(currentArtifact),
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel,
    enabledSkills: enabledSkillsForDirector(state),
    messages: buildArtifactConversationMessages(
      state,
      [
        shouldRepeatArtifactContextForFinalRequest(state) ? artifactContextForState(state) : "",
        formatArtifactUserRequest({
          modeHint,
          selectedOption,
          selectedOptionNote: trimmedNote
        })
      ].join("\n\n")
    )
  };
}

function formatOptionsDirectionRangeHint(optionMode: OptionGenerationMode) {
  if (optionMode === "divergent") {
    return "方向范围：发散。选项要更有脑洞，可以给更大胆的切入、结构、表达形式或读者场景。";
  }

  if (optionMode === "focused") {
    return "方向范围：专注。沿当前产物已经成立的思路继续推进，优先补清楚、写顺、写实。";
  }

  return "";
}

function formatArtifactDirectionRangeHint(optionMode: OptionGenerationMode) {
  if (optionMode === "divergent") {
    return "方向范围：发散。可以更大胆地重组角度、结构或表达方式，让内容有更强的新鲜感。";
  }

  if (optionMode === "focused") {
    return "方向范围：专注。沿当前产物已经成立的思路继续推进，优先补清楚、写顺、写实。";
  }

  return "";
}

function formatWritingIntentLabel(
  selectedOption: BranchOption | undefined,
  selectedOptionNote: string | undefined,
  modeHint: string
) {
  if (!selectedOption) return "";
  if (isSelectionReferenceOption(selectedOption)) {
    return [
      selectedOption.description,
      selectedOptionNote ? `补充要求：${selectedOptionNote}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    `${selectedOption.label}: ${selectedOption.description}`,
    selectedOptionNote ? `用户补充要求：${selectedOptionNote}` : "",
    modeHint
  ]
    .filter(Boolean)
    .join("\n");
}

export function summarizeEditedArtifactForDirector(state: SessionState, artifact: Artifact): DirectorInputParts {
  const selectedOptionLabel = "";

  return {
    artifactContext: artifactContextForState(state),
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    currentArtifact: formatArtifactForDirector(artifact),
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel,
    enabledSkills: enabledSkillsForDirector(state),
    messages: buildEditorMessages(state, artifact, selectedOptionLabel)
  };
}

export function summarizeCurrentArtifactOptionsForDirector(
  state: SessionState,
  optionMode: OptionGenerationMode = "balanced"
): DirectorInputParts {
  const selectedOptionLabel = formatOptionsDirectionRangeHint(optionMode);
  const currentArtifact = currentArtifactForState(state);

  return {
    artifactContext: artifactContextForState(state),
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    currentArtifact: formatArtifactForDirector(currentArtifact),
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel,
    enabledSkills: enabledSkillsForDirector(state),
    messages: buildEditorMessages(state, currentArtifact, selectedOptionLabel)
  };
}

export function summarizeArtifactSelectionRewriteForDirector(
  state: SessionState,
  artifact: Artifact,
  selectedText: string,
  instruction: string,
  field: string
) {
  return {
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    pathSummary: "",
    currentArtifact: formatArtifactForDirector(artifact),
    enabledSkills: skillsForTarget(enabledSkillsForDirector(state), "writer"),
    field,
    selectedText,
    instruction
  };
}

function enabledSkillsForDirector(state: SessionState) {
  return SkillSchema.array().parse(state.enabledSkills ?? []);
}

export function focusSessionStateForNode(state: SessionState, nodeId: string): SessionState | null {
  const treeNodes = state.treeNodes ?? state.selectedPath;
  const node = treeNodes.find((item) => item.id === nodeId);
  if (!node) return null;

  const currentArtifact = node.producedArtifactId
    ? state.artifacts.find((artifact) => artifact.id === node.producedArtifactId) ?? null
    : null;
  return {
    ...state,
    currentNode: node,
    currentArtifact,
    selectedPath: activePathFor(treeNodes, node)
  };
}

function activePathFor(nodes: SessionState["selectedPath"], currentNode: SessionState["currentNode"]) {
  if (!currentNode) return [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const path: SessionState["selectedPath"] = [];
  const visited = new Set<string>();
  let cursor: SessionState["currentNode"] | undefined = currentNode;

  while (cursor && !visited.has(cursor.id)) {
    path.unshift(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? nodesById.get(cursor.parentId) : undefined;
  }

  return path;
}

function formatPathForDirector(state: SessionState) {
  if (state.selectedPath.length === 0) {
    return "暂无修改历程。";
  }

  return state.selectedPath
    .map((node) => `第 ${node.roundIndex} 版：${node.roundIntent}`)
    .join("\n");
}

function buildArtifactConversationMessages(state: SessionState, finalUserRequest: string): DirectorMessage[] {
  const messages: DirectorMessage[] = [
    {
      role: "user",
      content: [
        artifactContextForState(state),
        `初始内容：\n${state.rootMemory.summary}`,
        `已学习偏好：\n${state.rootMemory.learnedSummary || "暂无已学习偏好。"}`
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];

  const lastPathIndex = state.selectedPath.length - 1;
  state.selectedPath.forEach((node, index) => {
    if (node.agentMessages.length > 0) {
      messages.push(...node.agentMessages);
    }

    messages.push({ role: "assistant", content: formatArtifactHistoryRoundForWriter(state, node, index === lastPathIndex) });

    const selectedOption = node.selectedOptionId
      ? node.options.find((option) => option.id === node.selectedOptionId)
      : null;
    const isCurrentArtifactIntent = index === lastPathIndex;
    if (selectedOption && !isCurrentArtifactIntent) {
      messages.push({ role: "user", content: formatSuggestionForDirector(selectedOption) });
    }
  });

  if (state.selectedPath.length === 0 && state.currentArtifact) {
    messages.push({ role: "assistant", content: formatCurrentArtifactForWriter(state.currentArtifact) });
  }

  messages.push({ role: "user", content: finalUserRequest });
  return mergeConsecutiveUserMessages(messages);
}

function buildEditorMessages(state: SessionState, currentArtifact: Artifact | null, reviewInstruction = ""): DirectorMessage[] {
  const messages: DirectorMessage[] = [
    {
      role: "user",
      content: [
        artifactContextForState(state),
        `初始内容：\n${state.rootMemory.summary}`,
        `已学习偏好：\n${state.rootMemory.learnedSummary || "暂无已学习偏好。"}`
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
  const lastPathIndex = state.selectedPath.length - 1;

  state.selectedPath.forEach((node, index) => {
    if (index > 0) {
      const parent = state.selectedPath[index - 1];
      const writingIntent = node.parentOptionId
        ? (parent.options.find((option) => option.id === node.parentOptionId) ?? null)
        : null;
      messages.push({ role: "user", content: formatEditorBranchChoice(node, writingIntent) });
    }

    if (node.agentMessages.length > 0) {
      messages.push(...node.agentMessages);
    }

    if (index < lastPathIndex) {
      const artifact = artifactForNode(state, node);
      if (artifact) {
        messages.push({ role: "assistant", content: formatEditorCompletedArtifact(node, artifact) });
      }
    }
  });

  const finalReviewMaterial = formatEditorCurrentReviewMaterial({
    currentArtifact,
    reviewInstruction
  });

  if (messages.length === 1 && state.selectedPath.every((node) => node.options.length === 0)) {
    messages[0].content = `${messages[0].content}\n\n${finalReviewMaterial}`;
    return messages;
  }

  messages.push({ role: "user", content: finalReviewMaterial });
  return messages;
}

function mergeConsecutiveUserMessages(messages: DirectorMessage[]) {
  const merged: DirectorMessage[] = [];

  for (const message of messages) {
    const previous = merged.at(-1);
    if (
      previous?.role === "user" &&
      message.role === "user" &&
      typeof previous.content === "string" &&
      typeof message.content === "string"
    ) {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  }

  return merged;
}

function formatArtifactHistoryRoundForWriter(
  state: SessionState,
  node: SessionState["selectedPath"][number],
  includeFullArtifact = false
) {
  const artifact = artifactForNode(state, node);
  if (artifact && includeFullArtifact) {
    return [
      `第 ${node.roundIndex} 版已形成产物`,
      formatArtifactForDirector(artifact)
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `第 ${node.roundIndex} 版已形成产物摘要`,
    `形成产物：${artifact ? formatArtifactVersionSummary(artifact) : "本轮未形成产物，仅保留本轮意图。"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCurrentArtifactForWriter(artifact: Artifact) {
  return ["当前已形成产物", formatArtifactForDirector(artifact)].join("\n");
}

function formatArtifactUserRequest({
  modeHint,
  selectedOption,
  selectedOptionNote
}: {
  modeHint?: string;
  selectedOption?: BranchOption;
  selectedOptionNote?: string;
}) {
  if (selectedOption && isSelectionReferenceOption(selectedOption)) {
    return [
      selectedOption.description,
      selectedOptionNote ? `补充要求：${selectedOptionNote}` : ""
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const selectedLines = selectedOption
    ? [
        formatSuggestionForDirector(selectedOption),
        selectedOptionNote ? `用户补充要求：${selectedOptionNote}` : "",
        modeHint
      ].filter(Boolean)
    : ["基于初始内容和上一版产物生成新的内容版本。"];

  return [
    ...selectedLines
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isSelectionReferenceOption(option: BranchOption) {
  return option.id.startsWith("custom-reference-") || option.description.trim().startsWith("用户引用文本：");
}

function artifactTypeIdForState(state: SessionState) {
  return state.session.artifactTypeId ?? state.rootMemory.preferences.artifactTypeId ?? DEFAULT_ARTIFACT_TYPE_ID;
}

function artifactContextForState(state: SessionState) {
  return formatArtifactInstructionsForDirector(artifactTypeIdForState(state));
}

function shouldRepeatArtifactContextForFinalRequest(state: SessionState) {
  return artifactTypeIdForState(state) !== DEFAULT_ARTIFACT_TYPE_ID;
}

function formatEditorCurrentReviewMaterial({
  currentArtifact,
  reviewInstruction
}: {
  currentArtifact: Artifact | null;
  reviewInstruction: string;
}) {
  return [
    "本轮审稿材料：",
    reviewInstruction ? `本轮要求：\n${reviewInstruction}` : "",
    `当前内容：\n${currentArtifact ? formatArtifactForDirector(currentArtifact) : "暂无内容。"}`
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatEditorBranchChoice(node: SessionState["selectedPath"][number], writingIntent: BranchOption | null) {
  return writingIntent
    ? `用户选择：${formatSuggestionForDirector(writingIntent)}`
    : `用户继续推进：${node.roundIntent}`;
}

function formatEditorCompletedArtifact(node: SessionState["selectedPath"][number], artifact: Artifact) {
  return [
    `第 ${node.roundIndex} 轮已形成产物`,
    `形成产物：${formatArtifactVersionSummary(artifact)}`
  ].join("\n");
}

function formatCurrentPathFoldedOptionsForDirector(state: SessionState) {
  return "";
}

function formatCurrentPathFoldedSuggestionTitlesForEditor(state: SessionState) {
  return "";
}

function currentPathOptions(state: SessionState) {
  return state.selectedPath.flatMap((node) => [...node.options, ...node.foldedOptions]);
}

function optionThatEnteredNode(
  path: SessionState["selectedPath"],
  node: SessionState["selectedPath"][number],
  index: number
) {
  if (!node.parentOptionId) {
    return null;
  }

  const parent = index > 0 ? path[index - 1] : null;
  return parent?.options.find((option) => option.id === node.parentOptionId) ?? null;
}

function formatSuggestionsForDirector(options: BranchOption[]) {
  return options.map((option) => option.label).join("；");
}

function formatSuggestionForDirector(option: BranchOption) {
  return `${option.label}: ${option.description}`;
}

function truncateText(text: string, maxLength: number) {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function uniqueOptions(options: BranchOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = `${option.id}:${option.label}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function uniqueLabels(options: BranchOption[]) {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const option of options) {
    if (!seen.has(option.label)) {
      seen.add(option.label);
      labels.push(option.label);
    }
  }

  return labels;
}

function formatArtifactForDirector(artifact: Artifact | null) {
  if (!artifact) return "";
  const plugin = getArtifactPlugin(artifact.type);
  if (!plugin) return JSON.stringify(artifact.payload, null, 2);
  const payload = plugin.payloadSchema.parse(artifact.payload);
  return plugin.summarizeForDirector(payload);
}

function formatArtifactVersionSummary(artifact: Artifact) {
  return truncateText(formatArtifactForDirector(artifact).replace(/\s+/g, " "), 36);
}

function artifactForNode(state: SessionState, node: SessionState["selectedPath"][number]) {
  if (!node.producedArtifactId) return null;
  return state.artifacts.find((artifact) => artifact.id === node.producedArtifactId) ?? null;
}

function currentArtifactForState(state: SessionState) {
  if (!state.currentNode) return state.currentArtifact;
  return artifactForNode(state, state.currentNode);
}
