import type { BranchOption, DirectorNextStepOutput, DirectorOptionsOutput } from "@/lib/domain";
import { DirectorArtifactOutputSchema, type DirectorArtifactOutput } from "./director";
import { logTritreeAiDebug } from "./debug-log";
import {
  generateTreeNextStep,
  streamTreeArtifact,
  streamTreeNextStep,
  streamTreeOptions,
  type DirectorAgentTrace,
  type MemoryScope,
  type ProcessDataDisplay
} from "./mastra-executor";
import type { DirectorInputParts } from "./prompts";

export type DirectorNextStepStreamResult = DirectorNextStepOutput & DirectorAgentTrace;
export type DirectorArtifactStreamResult = DirectorArtifactOutput & DirectorAgentTrace;
export type DirectorOptionsStreamResult = DirectorOptionsOutput & DirectorAgentTrace;

type DirectorArtifactStreamOptions = {
  env?: Record<string, string | undefined>;
  memory?: MemoryScope;
  onText?: (event: {
    delta: string;
    accumulatedText: string;
    partialArtifact: { type: string; payload: Record<string, unknown> } | null;
  }) => void;
  onProcessData?: (data: ProcessDataDisplay) => void;
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
  onProcessData?: (data: ProcessDataDisplay) => void;
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
  onProcessData?: (data: ProcessDataDisplay) => void;
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
    onProcessData: options.onProcessData,
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
  const outputWithTrace = await streamTreeArtifact({
    parts,
    env: options.env,
    memory: options.memory,
    signal: options.signal,
    onPartialObject: emit,
    onProcessData: options.onProcessData,
    onReasoningText: options.onReasoningText
  });
  const output = DirectorArtifactOutputSchema.parse(withoutAgentTrace(outputWithTrace));
  const tracedOutput = withAgentTrace(output, outputWithTrace);
  logTritreeAiDebug("director-stream", "artifact-output", {
    artifactType: output.artifact?.type ?? "",
    hasArtifact: Boolean(output.artifact)
  });
  emit(withoutAgentTrace(tracedOutput));
  return tracedOutput;
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
    onProcessData: options.onProcessData,
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

function withAgentTrace<T extends object>(value: T, trace: DirectorAgentTrace): T & DirectorAgentTrace {
  if (trace.agentMessages === undefined) return value;
  return { ...value, agentMessages: trace.agentMessages };
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
  return {
    artifact: {
      type: extractStringField(artifactText, "type"),
      payload: extractVisibleJsonObjectField(artifactText, "payload")
    }
  };
}

function extractVisibleJsonObjectField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`).exec(text);
  if (!match) return {};

  const objectStart = match.index + match[0].lastIndexOf("{");
  const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
  const objectText = objectEnd === -1 ? text.slice(objectStart) : text.slice(objectStart, objectEnd + 1);
  return extractVisibleJsonObjectFields(objectText);
}

function extractVisibleJsonObjectFields(text: string): Record<string, unknown> {
  const objectStart = text.indexOf("{");
  if (objectStart === -1) return {};

  const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
  if (objectEnd !== -1) {
    const parsed = parseMaybeJson(text.slice(objectStart, objectEnd + 1));
    return isRecord(parsed) ? parsed : {};
  }

  const fields: Record<string, unknown> = {};
  let index = objectStart + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "}") break;
    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char !== '"') {
      index += 1;
      continue;
    }

    const key = readVisibleJsonString(text, index + 1);
    const fieldName = parseJsonString(key.rawValue);
    index = skipJsonWhitespace(text, key.nextIndex);
    if (!fieldName || text[index] !== ":") {
      index += 1;
      continue;
    }

    const value = readVisibleJsonValue(text, skipJsonWhitespace(text, index + 1));
    if (value.found) {
      fields[fieldName] = value.value;
    }
    index = value.nextIndex > index ? value.nextIndex : index + 1;
  }

  return fields;
}

function readVisibleJsonValue(
  text: string,
  startIndex: number
): { found: true; nextIndex: number; value: unknown } | { found: false; nextIndex: number } {
  const index = skipJsonWhitespace(text, startIndex);
  const char = text[index];
  if (!char) return { found: false, nextIndex: index };

  if (char === '"') {
    const parsed = readVisibleJsonString(text, index + 1);
    return { found: true, nextIndex: parsed.nextIndex, value: parseJsonString(parsed.rawValue) };
  }

  if (char === "{") {
    const objectEnd = findMatchingJsonObjectEnd(text, index);
    if (objectEnd !== -1) {
      return { found: true, nextIndex: objectEnd + 1, value: parseMaybeJson(text.slice(index, objectEnd + 1)) };
    }
    return { found: true, nextIndex: text.length, value: extractVisibleJsonObjectFields(text.slice(index)) };
  }

  if (char === "[") {
    const arrayEnd = findMatchingJsonArrayEnd(text, index);
    if (arrayEnd !== -1) {
      return { found: true, nextIndex: arrayEnd + 1, value: parseMaybeJson(text.slice(index, arrayEnd + 1)) };
    }
    return { found: true, nextIndex: text.length, value: extractVisibleJsonArrayItems(text, index) };
  }

  const primitive = readVisibleJsonPrimitive(text, index);
  return primitive.found ? primitive : { found: false, nextIndex: primitive.nextIndex };
}

function extractVisibleJsonArrayItems(text: string, startIndex: number) {
  const values: unknown[] = [];
  let index = startIndex + 1;

  while (index < text.length) {
    const char = text[index];
    if (char === "]") break;
    if (char === "," || /\s/.test(char)) {
      index += 1;
      continue;
    }

    const value = readVisibleJsonValue(text, index);
    if (value.found) values.push(value.value);
    index = value.nextIndex > index ? value.nextIndex : index + 1;
  }

  return values;
}

function readVisibleJsonPrimitive(
  text: string,
  startIndex: number
): { found: true; nextIndex: number; value: unknown } | { found: false; nextIndex: number } {
  let index = startIndex;
  while (index < text.length && !/[,\]}\s]/.test(text[index])) {
    index += 1;
  }

  const rawValue = text.slice(startIndex, index).trim();
  if (!rawValue) return { found: false, nextIndex: index };
  const parsed = parseMaybeJson(rawValue);
  return parsed !== rawValue ? { found: true, nextIndex: index, value: parsed } : { found: false, nextIndex: index };
}

function skipJsonWhitespace(text: string, startIndex: number) {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
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
  for (let end = rawValue.length; end >= 0; end -= 1) {
    try {
      return JSON.parse(`"${rawValue.slice(0, end)}"`) as string;
    } catch {
      // Keep trimming until the visible JSON string prefix ends before an incomplete escape.
    }
  }

  return "";
}

function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
