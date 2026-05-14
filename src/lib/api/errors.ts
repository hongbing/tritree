import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function isBadRequestError(error: unknown) {
  return error instanceof SyntaxError || error instanceof ZodError;
}

export function badRequestResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "请求内容格式不正确。", issues: error.issues }, { status: 400 });
  }

  return NextResponse.json({ error: "请求不是有效的 JSON。" }, { status: 400 });
}

export function publicServerErrorMessage(error: unknown, fallback: string) {
  const details = publicErrorDetails(error);

  if (!details) return fallback;
  if (details.kind === "configuration" && details.message) {
    return `${trimSentenceEnd(fallback)}：${details.message}`;
  }

  if (details.kind === "context-length") {
    return `${trimSentenceEnd(fallback)}：内容较长，已尝试压缩后仍超出当前模型处理范围。`;
  }

  return fallback;
}

type PublicErrorDetails = {
  exitCode?: number;
  identifier?: string;
  kind: "configuration" | "context-length" | "hidden";
  message?: string;
  retryAfterSeconds?: number;
  status?: number;
};

function publicErrorDetails(error: unknown): PublicErrorDetails | null {
  const errorRecord = asRecord(error);
  const dataRecord = asRecord(errorRecord?.data);
  const dataErrorRecord = asRecord(dataRecord?.error);
  const responseBodyRecord = parseJsonRecord(stringField(errorRecord, "responseBody"));
  const responseBodyErrorRecord = asRecord(responseBodyRecord?.error);
  const directErrorRecord = asRecord(errorRecord?.error);
  const detailsRecord = asRecord(errorRecord?.details);
  const headers = asRecord(errorRecord?.responseHeaders);
  const status = numberField(errorRecord, "status") ?? numberField(errorRecord, "statusCode");
  const exitCode = numberField(errorRecord, "exitCode");
  const id = stringField(errorRecord, "id") ?? stringField(errorRecord, "code");
  const domain = stringField(errorRecord, "domain");
  const category = stringField(errorRecord, "category");
  const message =
    stringField(dataErrorRecord, "message") ??
    stringField(responseBodyErrorRecord, "message") ??
    stringField(directErrorRecord, "message") ??
    stringField(errorRecord, "stderr") ??
    stringField(errorRecord, "stdout") ??
    (error instanceof Error ? error.message : stringField(errorRecord, "message"));

  const hasExternalBoundaryShape =
    status !== undefined ||
    exitCode !== undefined ||
    dataErrorRecord !== null ||
    responseBodyErrorRecord !== null ||
    directErrorRecord !== null ||
    Boolean(stringField(errorRecord, "url"));
  const hasStructuredBoundaryShape = Boolean(id && (domain || category || detailsRecord));
  const hasSafeConfigurationShape = error instanceof Error && /(?:not configured|missing)/i.test(error.message);

  if (!hasExternalBoundaryShape && !hasStructuredBoundaryShape && !hasSafeConfigurationShape) return null;

  const sanitizedMessage = sanitizePublicMessage(message);
  const kind = hasSafeConfigurationShape
    ? "configuration"
    : isContextLengthMessage(sanitizedMessage)
      ? "context-length"
      : "hidden";

  return {
    exitCode,
    identifier: hasStructuredBoundaryShape ? [domain, id].filter(Boolean).join("/") : undefined,
    kind,
    message: sanitizedMessage,
    retryAfterSeconds: numberFromUnknown(headers?.["retry-after"] ?? headers?.["x-retry-after"]),
    status
  };
}

function trimSentenceEnd(value: string) {
  return value.replace(/[。.!?]+$/u, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown> | null | undefined, field: string) {
  const value = record?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberField(record: Record<string, unknown> | null | undefined, field: string) {
  return numberFromUnknown(record?.[field]);
}

function numberFromUnknown(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseJsonRecord(value: string | undefined) {
  if (!value) return null;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function sanitizePublicMessage(value: string | undefined) {
  if (!value) return undefined;
  const collapsed = value.replace(/\s+/g, " ").trim();
  const redacted = collapsed
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b((?:api[_-]?key|token|password|secret)\s*[:=]\s*)["']?[^"',\s}]+/gi, "$1[redacted]")
    .replace(/([?&](?:api[_-]?key|token|authorization|password|secret|access_token)=)[^&\s]+/gi, "$1[redacted]");
  return redacted.length > 800 ? `${redacted.slice(0, 797)}...` : redacted;
}

function isContextLengthMessage(value: string | undefined) {
  if (!value) return false;
  return /(context|token|conversation|message|prompt|对话|上下文|内容|输入).{0,30}(long|length|limit|exceed|overflow|超|长|限制|窗口|处理能力)/i.test(value);
}
