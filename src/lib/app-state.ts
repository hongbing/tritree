import {
  SkillSchema,
  skillsForTarget,
  DEFAULT_ARTIFACT_TYPE_ID,
  type BranchOption,
  type Draft,
  type OptionGenerationMode,
  type SessionState
} from "@/lib/domain";
import type { DirectorInputParts, DirectorMessage } from "@/lib/ai/prompts";
import { formatArtifactInstructionsForDirector } from "@/lib/artifacts";

export function summarizeSessionForDirector(
  state: SessionState,
  selectedOption?: BranchOption,
  selectedOptionNote?: string,
  optionMode: OptionGenerationMode = "balanced"
): DirectorInputParts {
  const trimmedNote = selectedOptionNote?.trim();
  const modeHint = formatDraftDirectionRangeHint(optionMode);
  const selectedOptionLabel = formatWritingIntentLabel(selectedOption, trimmedNote, modeHint);
  const currentDraft = currentDraftForState(state);

  return {
    artifactContext: artifactContextForState(state),
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    currentDraft: currentDraft ? formatDraftForDirector(currentDraft) : "",
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel,
    enabledSkills: enabledSkillsForDirector(state),
    messages: buildDraftConversationMessages(
      state,
      [
        shouldRepeatArtifactContextForFinalRequest(state) ? artifactContextForState(state) : "",
        formatDraftUserRequest({
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
    return "方向范围：专注。沿当前稿已经成立的思路继续推进，优先补清楚、写顺、写实。";
  }

  return "";
}

function formatDraftDirectionRangeHint(optionMode: OptionGenerationMode) {
  if (optionMode === "divergent") {
    return "方向范围：发散。可以更大胆地重组角度、结构或表达方式，让内容有更强的新鲜感。";
  }

  if (optionMode === "focused") {
    return "方向范围：专注。沿当前稿已经成立的思路继续推进，优先补清楚、写顺、写实。";
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

export function summarizeEditedDraftForDirector(state: SessionState, draft: Draft): DirectorInputParts {
  const selectedOptionLabel = "";

  return {
    artifactContext: artifactContextForState(state),
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    currentDraft: formatDraftForDirector(draft),
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel,
    enabledSkills: enabledSkillsForDirector(state),
    messages: buildEditorMessages(state, draft, selectedOptionLabel)
  };
}

export function summarizeCurrentDraftOptionsForDirector(
  state: SessionState,
  optionMode: OptionGenerationMode = "balanced"
): DirectorInputParts {
  const selectedOptionLabel = formatOptionsDirectionRangeHint(optionMode);
  const currentDraft = currentDraftForState(state);

  return {
    artifactContext: artifactContextForState(state),
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    currentDraft: currentDraft ? formatDraftForDirector(currentDraft) : "",
    pathSummary: "",
    foldedSummary: "",
    selectedOptionLabel,
    enabledSkills: enabledSkillsForDirector(state),
    messages: buildEditorMessages(state, currentDraft, selectedOptionLabel)
  };
}

export function summarizeSelectionRewriteForDirector(
  state: SessionState,
  draft: Draft,
  selectedText: string,
  instruction: string,
  field: "body"
) {
  return {
    rootSummary: state.rootMemory.summary,
    learnedSummary: state.rootMemory.learnedSummary,
    pathSummary: "",
    currentDraft: draft,
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

  const nodeDraft =
    state.nodeDrafts.find((item) => item.nodeId === nodeId)?.draft ??
    (state.currentNode?.id === nodeId ? state.currentDraft : null);
  return {
    ...state,
    currentNode: node,
    currentDraft: nodeDraft,
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

function buildDraftConversationMessages(state: SessionState, finalUserRequest: string): DirectorMessage[] {
  const messages: DirectorMessage[] = [
    {
      role: "user",
      content: [
        artifactContextForState(state),
        `初始内容：\n${state.rootMemory.summary}`,
        `已学习偏好：\n${state.rootMemory.learnedSummary || "暂无已学习偏好。"}`,
        formatToolMemoryForDirector(state.toolMemory)
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];

  const lastPathIndex = state.selectedPath.length - 1;
  state.selectedPath.forEach((node, index) => {
    messages.push({ role: "assistant", content: formatDraftHistoryRoundForWriter(state, node, index === lastPathIndex) });

    const selectedOption = node.selectedOptionId
      ? node.options.find((option) => option.id === node.selectedOptionId)
      : null;
    const isCurrentDraftIntent = index === lastPathIndex;
    if (selectedOption && !isCurrentDraftIntent) {
      messages.push({ role: "user", content: `下一步写作意图：${formatSuggestionForDirector(selectedOption)}` });
    }
  });

  if (state.selectedPath.length === 0 && state.currentDraft) {
    messages.push({ role: "assistant", content: formatCurrentDraftForWriter(state.currentDraft) });
  }

  messages.push({ role: "user", content: finalUserRequest });
  return mergeConsecutiveUserMessages(messages);
}

function buildEditorMessages(state: SessionState, currentDraft: Draft | null, reviewInstruction = ""): DirectorMessage[] {
  const messages: DirectorMessage[] = [
    {
      role: "user",
      content: [
        artifactContextForState(state),
        `初始内容：\n${state.rootMemory.summary}`,
        `已学习偏好：\n${state.rootMemory.learnedSummary || "暂无已学习偏好。"}`,
        formatToolMemoryForDirector(state.toolMemory)
      ]
        .filter(Boolean)
        .join("\n\n")
    }
  ];
  const lastPathIndex = state.selectedPath.length - 1;
  let latestRevisionSummary = "";

  state.selectedPath.forEach((node, index) => {
    if (node.options.length > 0) {
      messages.push({ role: "assistant", content: formatEditorSuggestionRound(node) });
    }

    if (index >= lastPathIndex) return;

    const nextNode = state.selectedPath[index + 1];
    const writingIntent = nextNode.parentOptionId
      ? (node.options.find((option) => option.id === nextNode.parentOptionId) ?? null)
      : null;
    const revisionSummary = formatEditorRevisionSummary(nextNode, writingIntent, draftForNode(state, nextNode));

    if (index + 1 === lastPathIndex) {
      latestRevisionSummary = revisionSummary;
    } else {
      messages.push({ role: "user", content: revisionSummary });
    }
  });

  const finalReviewMaterial = formatEditorCurrentReviewMaterial({
    currentDraft,
    latestRevisionSummary,
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
    if (previous?.role === "user" && message.role === "user") {
      previous.content = `${previous.content}\n\n${message.content}`;
    } else {
      merged.push({ ...message });
    }
  }

  return merged;
}

function formatToolMemoryForDirector(toolMemory?: string) {
  const text = toolMemory?.trim();
  if (!text) return "";

  return [
    "已完成的外部查询/工具结果：",
    text,
    "使用规则：如果已有结果覆盖当前任务，先复用；不要重复相同查询，除非用户要求更新、查询条件改变或已有结果明显不足。"
  ].join("\n");
}

function formatDraftHistoryRoundForWriter(
  state: SessionState,
  node: SessionState["selectedPath"][number],
  includeFullDraft = false
) {
  const draft = draftForNode(state, node);
  if (draft && includeFullDraft) {
    return [
      `第 ${node.roundIndex} 版已形成草稿`,
      formatDraftForDirector(draft)
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `第 ${node.roundIndex} 版已形成版本摘要`,
    `形成版本：${draft ? formatDraftVersionSummary(draft) : "暂无可用正文，仅保留本轮意图。"}`
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCurrentDraftForWriter(draft: Draft) {
  return ["当前已形成草稿", formatDraftForDirector(draft)].join("\n");
}

function formatDraftUserRequest({
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
        `用户想要完成的写作意图：${formatSuggestionForDirector(selectedOption)}`,
        selectedOptionNote ? `用户补充要求：${selectedOptionNote}` : "",
        modeHint
      ].filter(Boolean)
    : ["用户想要完成的写作意图：基于初始内容和上一版草稿生成新的内容版本。"];

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
  currentDraft,
  latestRevisionSummary,
  reviewInstruction
}: {
  currentDraft: Draft | null;
  latestRevisionSummary: string;
  reviewInstruction: string;
}) {
  return [
    "本轮审稿材料：",
    reviewInstruction ? `本轮要求：\n${reviewInstruction}` : "",
    `当前内容：\n${currentDraft ? formatDraftForDirector(currentDraft) : "暂无内容。"}`,
    latestRevisionSummary
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatEditorSuggestionRound(node: SessionState["selectedPath"][number]) {
  return [
    `第 ${node.roundIndex} 次澄清问题摘要`,
    `当前问题：${truncateText(node.roundIntent, 120)}`,
    `答案标题：${formatSuggestionsForDirector(node.options)}`
  ].join("\n");
}

function formatEditorRevisionSummary(
  node: SessionState["selectedPath"][number],
  writingIntent: BranchOption | null,
  draft: Draft | null
) {
  return [
    `最近一次修改：${writingIntent ? writingIntent.label : node.roundIntent}`,
    `形成版本：${draft ? formatDraftVersionSummary(draft) : node.roundIntent}`
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

function formatDraftForDirector(draft: Draft) {
  return [
    `标题：${draft.title || "未命名"}`,
    `正文：${draft.body}`,
    `话题：${draft.hashtags.join("、") || "暂无"}`,
    `配图提示：${draft.imagePrompt || "暂无"}`
  ].join("\n");
}

function formatDraftVersionSummary(draft: Draft) {
  return [
    `标题：${draft.title || "未命名"}`,
    `正文约 ${draft.body.length} 字`,
    `话题：${draft.hashtags.join("、") || "暂无"}`,
    draft.imagePrompt ? "已有配图提示" : "暂无配图提示"
  ].join("；");
}

function draftForNode(state: SessionState, node: SessionState["selectedPath"][number]) {
  return draftForNodeId(state, node.id) ?? nearestAncestorDraftForNode(state, node);
}

function currentDraftForState(state: SessionState) {
  if (!state.currentNode) return state.currentDraft;
  return draftForNode(state, state.currentNode);
}

function draftForNodeId(state: SessionState, nodeId: string) {
  return state.nodeDrafts.find((item) => item.nodeId === nodeId)?.draft ?? (state.currentNode?.id === nodeId ? state.currentDraft : null);
}

function nearestAncestorDraftForNode(state: SessionState, node: SessionState["selectedPath"][number]) {
  const nodesById = new Map(
    [...(state.treeNodes ?? []), ...state.selectedPath, ...(state.currentNode ? [state.currentNode] : [])].map((item) => [item.id, item])
  );
  let cursor = node.parentId ? nodesById.get(node.parentId) : null;

  while (cursor) {
    const draft = draftForNodeId(state, cursor.id);
    if (draft) return draft;
    cursor = cursor.parentId ? nodesById.get(cursor.parentId) : null;
  }

  return null;
}
