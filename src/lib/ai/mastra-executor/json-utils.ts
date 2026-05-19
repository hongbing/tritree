import type { StreamSource } from "./types";

export function stringifyDiagnosticValue(value: unknown) {
  const seen = new WeakSet<object>();
  const text = JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Error) {
        return {
          message: item.message,
          name: item.name,
          stack: item.stack
        };
      }

      if (item && typeof item === "object") {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }

      return item;
    },
    2
  );
  return text ?? String(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractVisibleJsonObjectField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*\\{`).exec(text);
  if (!match) return {};

  const objectStart = match.index + match[0].lastIndexOf("{");
  const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
  const objectText = objectEnd === -1 ? text.slice(objectStart) : text.slice(objectStart, objectEnd + 1);
  return extractVisibleJsonObjectFields(objectText);
}

export function extractVisibleJsonObjectFields(text: string): Record<string, unknown> {
  const objectStart = text.indexOf("{");
  if (objectStart === -1) return {};

  const objectEnd = findMatchingJsonObjectEnd(text, objectStart);
  if (objectEnd !== -1) {
    const parsed = parseMaybeJson(text.slice(objectStart, objectEnd + 1));
    return isObjectRecord(parsed) ? parsed : {};
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
    const fieldName = parseJsonStringValue(key.rawValue);
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
    return { found: true, nextIndex: parsed.nextIndex, value: parseJsonStringValue(parsed.rawValue) };
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

export function extractVisibleJsonStringField(text: string, fieldName: string) {
  const match = new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"`).exec(text);
  if (!match) return "";
  const parsed = readVisibleJsonString(text, match.index + match[0].length);
  return parseJsonStringValue(parsed.rawValue);
}

export function extractVisibleJsonObjectBlocks(text: string) {
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
  return findMatchingJsonStructureEnd(text, startIndex, "{", "}");
}

function findMatchingJsonArrayEnd(text: string, startIndex: number) {
  return findMatchingJsonStructureEnd(text, startIndex, "[", "]");
}

function findMatchingJsonStructureEnd(text: string, startIndex: number, open: string, close: string) {
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
    } else if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) return index;
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

  if (isEscaped) rawValue += "\\";
  return { rawValue, nextIndex: text.length };
}

function parseJsonStringValue(rawValue: string) {
  try {
    return JSON.parse(`"${rawValue}"`) as string;
  } catch {
    for (let end = rawValue.length - 1; end >= 0; end -= 1) {
      try {
        return JSON.parse(`"${rawValue.slice(0, end)}"`) as string;
      } catch {
        // Keep trimming until the visible JSON string prefix ends before an incomplete escape.
      }
    }

    return "";
  }
}

export function summarizeJsonValue(value: unknown, maxLength: number) {
  if (value === undefined) return "";
  if (typeof value === "string") return truncateText(value.trim(), maxLength);
  try {
    return truncateText(JSON.stringify(value), maxLength);
  } catch {
    return truncateText(String(value), maxLength);
  }
}

export function truncateText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

export function parseMaybeJson(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export async function* toAsyncIterable<T>(source: StreamSource<T>): AsyncIterable<T> {
  const resolved = typeof source === "function" ? source() : source;

  if (isAsyncIterable<T>(resolved)) {
    yield* resolved;
    return;
  }

  const readable = resolved as ReadableStream<T>;
  if (typeof (readable as { getReader?: unknown }).getReader !== "function") {
    throw new Error("Mastra structured stream did not expose an async iterable or readable object stream.");
  }

  const reader = readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return typeof (value as { [Symbol.asyncIterator]?: unknown })?.[Symbol.asyncIterator] === "function";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
