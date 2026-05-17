import type { BranchOption, DirectorNextStepOutput, DirectorOptionsOutput } from "@/lib/domain";
import { DirectorArtifactOutputSchema, type DirectorArtifactOutput } from "./director";
import { logTritreeAiDebug } from "./debug-log";
import {
  generateTreeNextStep,
  streamTreeArtifact,
  streamTreeNextStep,
  streamTreeOptions,
  type DirectorAgentTrace,
  type MemoryScope
} from "./mastra-executor";
import type { DirectorInputParts } from "./prompts";

export type DirectorNextStepStreamResult = DirectorNextStepOutput & DirectorAgentTrace;
export type DirectorArtifactStreamResult = DirectorArtifactOutput;
export type DirectorOptionsStreamResult = DirectorOptionsOutput & DirectorAgentTrace;

type DirectorArtifactStreamOptions = {
  env?: Record<string, string | undefined>;
  memory?: MemoryScope;
  onText?: (event: {
    delta: string;
    accumulatedText: string;
    partialArtifact: { type: string; payload: Record<string, unknown> } | null;
  }) => void;
  onReasoningText?: (event: { delta: string; accumulatedText: string }) => void;
  signal?: AbortSignal;
};

type DirectorOptionsStreamOptions = {
  env?: Record<string, string | undefined>;
  memory?: MemoryScope;
  onText?: (event: {
    delta: string;
    accumulatedText: string;
    partialOptions: BranchOption[] | null;
    partialRoundIntent: string | null;
  }) => void;
  onReasoningText?: (event: { delta: string; accumulatedText: string }) => void;
  signal?: AbortSignal;
};

type DirectorNextStepOptions = {
  env?: Record<string, string | undefined>;
  memory?: MemoryScope;
  onText?: (event: {
    delta: string;
    accumulatedText: string;
    partialOptions: BranchOption[] | null;
    partialRoundIntent: string | null;
  }) => void;
  onReasoningText?: (event: { delta: string; accumulatedText: string }) => void;
  signal?: AbortSignal;
};

export async function decideDirectorNextStep(
  parts: DirectorInputParts,
  options: DirectorNextStepOptions = {}
): Promise<DirectorNextStepOutput> {
  logTritreeAiDebug("director-stream", "next-step-start", {
    rootChars: parts.rootSummary.length,
    currentArtifactChars: parts.currentArtifact.length,
    messageCount: parts.messages.length
  });
  const output = await generateTreeNextStep({
    parts,
    env: options.env,
    memory: options.memory,
    signal: options.signal
  });
    logTritreeAiDebug("director-stream", "next-step-output", {
    action: output.action,
    roundIntent: output.roundIntent,
    optionCount: output.action === "options" ? output.options.length : 0
  });
  return output;
}

export async function streamDirectorNextStep(
  parts: DirectorInputParts,
  options: DirectorNextStepOptions = {}
): Promise<DirectorNextStepStreamResult> {
  let accumulatedText = "";
  const emit = (value: unknown) => {
    const text = JSON.stringify(value);
    if (!text || text === accumulatedText) return;
    accumulatedText = text;
    const partialOptions = extractPartialDirectorOptions(accumulatedText);
    const partialRoundIntent = extractStringField(accumulatedText, "roundIntent") || null;
    logTritreeAiDebug("director-stream", "next-step-emit", {
      action: isRecord(value) ? value.action : undefined,
      chars: accumulatedText.length,
      hasPartialRoundIntent: Boolean(partialRoundIntent),
      hasPartialOptions: Boolean(partialOptions),
      optionCount: partialOptions?.length ?? 0,
      optionLabels: partialOptions?.map((option) => option.label) ?? []
    });
    options.onText?.({
      delta: text,
      accumulatedText,
      partialOptions,
      partialRoundIntent
    });
  };

  logTritreeAiDebug("director-stream", "next-step-stream-start", {
    rootChars: parts.rootSummary.length,
    currentArtifactChars: parts.currentArtifact.length,
    messageCount: parts.messages.length
  });
  const output = await streamTreeNextStep({
    parts,
    env: options.env,
    memory: options.memory,
    signal: options.signal,
    onPartialObject: emit,
    onReasoningText: options.onReasoningText
  });
  logTritreeAiDebug("director-stream", "next-step-stream-output", {
    action: output.action,
    roundIntent: output.roundIntent,
    optionCount: output.action === "options" ? output.options.length : 0
  });
  emit(withoutAgentTrace(output));
  return output;
}

export async function streamDirectorArtifact(
  parts: DirectorInputParts,
  options: DirectorArtifactStreamOptions = {}
): Promise<DirectorArtifactStreamResult> {
  let accumulatedText = "";
  const emit = (value: unknown) => {
    const text = JSON.stringify(value);
    if (!text || text === accumulatedText) return;
    accumulatedText = text;
    const partialArtifact = extractPartialDirectorArtifact(accumulatedText);
    logTritreeAiDebug("director-stream", "artifact-emit", {
      chars: accumulatedText.length,
      hasPartialArtifact: Boolean(partialArtifact),
      artifactType: partialArtifact?.type ?? "",
      payloadFields: partialArtifact ? Object.keys(partialArtifact.payload) : []
    });
    options.onText?.({
      delta: text,
      accumulatedText,
      partialArtifact
    });
  };

  logTritreeAiDebug("director-stream", "artifact-start", {
    rootChars: parts.rootSummary.length,
    currentArtifactChars: parts.currentArtifact.length,
    messageCount: parts.messages.length
  });
  const output = DirectorArtifactOutputSchema.parse(await streamTreeArtifact({
    parts,
    env: options.env,
    memory: options.memory,
    signal: options.signal,
    onPartialObject: emit,
    onReasoningText: options.onReasoningText
  }));
  logTritreeAiDebug("director-stream", "artifact-output", {
    artifactType: output.artifact?.type ?? "",
    hasArtifact: Boolean(output.artifact)
  });
  emit(withoutAgentTrace(output));
  return output;
}

export async function streamDirectorOptions(
  parts: DirectorInputParts,
  options: DirectorOptionsStreamOptions = {}
): Promise<DirectorOptionsStreamResult> {
  let accumulatedText = "";
  const emit = (value: unknown) => {
    const text = JSON.stringify(value);
    if (!text || text === accumulatedText) return;
    accumulatedText = text;
    const partialOptions = extractPartialDirectorOptions(accumulatedText);
    const partialRoundIntent = extractStringField(accumulatedText, "roundIntent") || null;
    logTritreeAiDebug("director-stream", "options-emit", {
      chars: accumulatedText.length,
      hasPartialRoundIntent: Boolean(partialRoundIntent),
      hasPartialOptions: Boolean(partialOptions),
      optionCount: partialOptions?.length ?? 0,
      optionLabels: partialOptions?.map((option) => option.label) ?? []
    });
    options.onText?.({
      delta: text,
      accumulatedText,
      partialOptions,
      partialRoundIntent
    });
  };

  logTritreeAiDebug("director-stream", "options-start", {
    rootChars: parts.rootSummary.length,
    currentArtifactChars: parts.currentArtifact.length,
    messageCount: parts.messages.length
  });
  const output = await streamTreeOptions({
    parts,
    env: options.env,
    memory: options.memory,
    signal: options.signal,
    onPartialObject: emit,
    onReasoningText: options.onReasoningText
  });
  logTritreeAiDebug("director-stream", "options-output", {
    roundIntent: output.roundIntent,
    optionCount: output.options.length,
    optionLabels: output.options.map((option) => option.label)
  });
  emit(withoutAgentTrace(output));
  return output;
}

function withoutAgentTrace<T extends object>(value: T): T {
  const { agentMessages: _agentMessages, ...rest } = value as T & DirectorAgentTrace;
  return rest as T;
}

export function extractPartialDirectorArtifact(text: string) {
  const parsed = extractPartialJsonObject(text);
  if (!isRecord(parsed.artifact)) return null;
  const type = typeof parsed.artifact.type === "string" ? parsed.artifact.type : "";
  const payload = isRecord(parsed.artifact.payload) ? parsed.artifact.payload : {};
  return type ? { type, payload } : null;
}

export function extractPartialDirectorOptions(text: string): BranchOption[] | null {
  const optionsMatch = /"options"\s*:\s*\[/.exec(text);
  if (!optionsMatch) {
    return null;
  }

  const optionsText = text.slice(optionsMatch.index + optionsMatch[0].length);
  const optionBlocks = extractVisibleObjectBlocks(optionsText);
  const partialById = new Map<BranchOption["id"], Partial<BranchOption>>();
  const fallbackIds = ["a", "b", "c"] as const;

  for (const [index, block] of optionBlocks.entries()) {
    const explicitId = extractStringField(block, "id");
    const id = explicitId === "a" || explicitId === "b" || explicitId === "c" ? explicitId : fallbackIds[index];
    if (!id) {
      continue;
    }

    partialById.set(id, {
      id,
      label: extractStringField(block, "label"),
      description: extractStringField(block, "description"),
      impact: extractStringField(block, "impact"),
      kind: extractOptionKind(block)
    });
  }

  if (partialById.size === 0) {
    return null;
  }

  const fallbackKinds: Record<"a" | "b" | "c", BranchOption["kind"]> = {
    a: "explore",
    b: "deepen",
    c: "reframe"
  };

  return (["a", "b", "c"] as const).flatMap((id) => {
    const option = partialById.get(id);
    if (!option) return [];
    const label = option.label?.trim();
    if (!label) return [];

    return [
      {
        id,
        label,
        description: option.description || "正在生成方向说明",
        impact: option.impact || "正在生成影响说明",
        kind: option.kind || fallbackKinds[id]
      }
    ];
  });
}

function extractPartialJsonObject(text: string) {
  const artifactMatch = /"artifact"\s*:\s*\{/.exec(text);
  if (!artifactMatch) return {};

  const artifactText = text.slice(artifactMatch.index + artifactMatch[0].length - 1);
  const payload: Record<string, unknown> = {};
  const payloadMatch = /"payload"\s*:\s*\{/.exec(artifactText);
  if (payloadMatch) {
    const payloadStart = payloadMatch.index + payloadMatch[0].length - 1;
    const payloadEnd = findMatchingJsonObjectEnd(artifactText, payloadStart);
    const payloadText =
      payloadEnd === -1
        ? artifactText.slice(payloadMatch.index + payloadMatch[0].length)
        : artifactText.slice(payloadMatch.index + payloadMatch[0].length, payloadEnd);
    const fieldPattern = /"([^"]+)"\s*:\s*"/g;
    let fieldMatch = fieldPattern.exec(payloadText);
    while (fieldMatch) {
      const valueStart = fieldMatch.index + fieldMatch[0].length;
      const { rawValue } = readVisibleJsonString(payloadText, valueStart);
      payload[fieldMatch[1]] = parseJsonString(rawValue.endsWith("\\") ? rawValue.slice(0, -1) : rawValue);
      fieldMatch = fieldPattern.exec(payloadText);
    }

    const arrayFieldPattern = /"([^"]+)"\s*:\s*\[/g;
    let arrayFieldMatch = arrayFieldPattern.exec(payloadText);
    while (arrayFieldMatch) {
      payload[arrayFieldMatch[1]] = extractStringArrayField(payloadText, arrayFieldMatch[1]);
      arrayFieldMatch = arrayFieldPattern.exec(payloadText);
    }
  }

  return {
    artifact: {
      type: extractStringField(artifactText, "type"),
      payload
    }
  };
}

function extractStringField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`).exec(text);
  if (!match) {
    return "";
  }

  let rawValue = "";
  let isEscaped = false;
  for (let index = match.index + match[0].length; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      rawValue += `\\${char}`;
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      return parseJsonString(rawValue);
    }

    rawValue += char;
  }

  return parseJsonString(rawValue);
}

function extractOptionKind(text: string): BranchOption["kind"] | undefined {
  const kind = extractStringField(text, "kind");
  if (kind === "explore" || kind === "deepen" || kind === "reframe" || kind === "finish") {
    return kind;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractVisibleObjectBlocks(text: string) {
  const blocks: string[] = [];
  let searchIndex = 0;

  while (searchIndex < text.length) {
    const objectStart = text.indexOf("{", searchIndex);
    if (objectStart === -1) break;
    const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
    if (objectEnd === -1) {
      blocks.push(text.slice(objectStart));
      break;
    }

    blocks.push(text.slice(objectStart, objectEnd + 1));
    searchIndex = objectEnd + 1;
  }

  return blocks;
}

function findMatchingJsonObjectEnd(text: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractStringArrayField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\[`).exec(text);
  if (!match) {
    return [];
  }

  const arrayStart = match.index + match[0].lastIndexOf("[");
  const arrayEnd = findMatchingJsonArrayEnd(text, arrayStart);
  if (arrayEnd === -1) {
    return extractVisibleStringArrayItems(text, arrayStart);
  }

  try {
    const value = JSON.parse(text.slice(arrayStart, arrayEnd + 1)) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function findMatchingJsonArrayEnd(text: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractVisibleStringArrayItems(text: string, arrayStart: number) {
  const values: string[] = [];
  let index = arrayStart + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char !== '"') {
      index += 1;
      continue;
    }

    const parsed = readVisibleJsonString(text, index + 1);
    values.push(parseJsonString(parsed.rawValue));
    index = parsed.nextIndex;
  }

  return values;
}

function readVisibleJsonString(text: string, startIndex: number) {
  let rawValue = "";
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      rawValue += `\\${char}`;
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      return { rawValue, nextIndex: index + 1 };
    }

    rawValue += char;
  }

  if (isEscaped) {
    rawValue += "\\";
  }

  return { rawValue, nextIndex: text.length };
}

function parseJsonString(rawValue: string) {
  try {
    return JSON.parse(`"${rawValue}"`) as string;
  } catch {
    return rawValue;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
