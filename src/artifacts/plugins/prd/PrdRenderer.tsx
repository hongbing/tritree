"use client";

import { useEffect, useState } from "react";
import type { ArtifactRendererProps } from "@/artifacts/types";
import { PrdPayloadSchema, type PrdPayload } from "./schema";

const requiredSections = ["背景", "目标", "非目标", "用户", "需求", "指标", "风险", "待确认"];

export function PrdRenderer({ artifact, isBusy, onSave }: ArtifactRendererProps) {
  const parsed = PrdPayloadSchema.safeParse(artifact.payload);
  const payload = parsed.success ? parsed.data : null;
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(() => payload?.title ?? "");
  const [markdown, setMarkdown] = useState(() => payload?.markdown ?? "");

  useEffect(() => {
    if (!payload) return;
    setIsEditing(false);
    setTitle(payload.title);
    setMarkdown(payload.markdown);
  }, [artifact.id, payload?.title, payload?.markdown]);

  if (!payload) {
    return (
      <article className="artifact-renderer" data-testid="prd-renderer">
        <h3>{artifact.type}</h3>
        <pre>{JSON.stringify(artifact.payload, null, 2)}</pre>
      </article>
    );
  }

  async function saveEditedPayload() {
    const nextPayload: PrdPayload = { title, markdown };
    await onSave?.(nextPayload);
    setIsEditing(false);
  }

  function cancelEditing() {
    setTitle(payload?.title ?? "");
    setMarkdown(payload?.markdown ?? "");
    setIsEditing(false);
  }

  return (
    <article aria-busy={isBusy} className="prd-artifact" data-testid="prd-renderer">
      {isEditing ? (
        <>
          <div className="prd-artifact__header">
            <h2>编辑 PRD</h2>
          </div>
          <label className="prd-artifact__field">
            <span>文档标题</span>
            <input
              aria-label="文档标题"
              disabled={isBusy}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label className="prd-artifact__field">
            <span>PRD Markdown</span>
            <textarea
              aria-label="PRD Markdown"
              disabled={isBusy}
              onChange={(event) => setMarkdown(event.target.value)}
              rows={16}
              value={markdown}
            />
          </label>
          <div className="prd-artifact__actions">
            <button disabled={isBusy} onClick={cancelEditing} type="button">
              取消
            </button>
            <button disabled={isBusy} onClick={() => void saveEditedPayload()} type="button">
              保存
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="prd-artifact__header">
            <h2>{payload.title || "未命名 PRD"}</h2>
            {onSave ? (
              <button disabled={isBusy} onClick={() => setIsEditing(true)} type="button">
                编辑
              </button>
            ) : null}
          </div>
          <div className="prd-artifact__markdown">{renderMarkdownBlocks(payload.markdown)}</div>
          <div aria-label="PRD 检查" className="prd-artifact__checks">
            {requiredSections.map((section) => (
              <p key={section}>
                {hasMarkdownSection(payload.markdown, section) ? "已包含" : "缺少"}：{section}
              </p>
            ))}
          </div>
        </>
      )}
    </article>
  );
}

function renderMarkdownBlocks(markdown: string) {
  return markdown
    .split(/\n{2,}/)
    .flatMap((block, blockIndex) => {
      const lines = block.split("\n");
      return lines.flatMap((line, lineIndex) => renderMarkdownLine(line, `${blockIndex}-${lineIndex}`));
    })
    .filter(Boolean);
}

function renderMarkdownLine(line: string, key: string) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const level = Math.min(heading[1].length + 1, 6);
    const HeadingTag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
    return <HeadingTag key={key}>{heading[2].trim()}</HeadingTag>;
  }

  return <p key={key}>{trimmed}</p>;
}

function hasMarkdownSection(markdown: string, section: string) {
  return new RegExp(`(^|\\n)#{1,6}\\s*${escapeRegExp(section)}(\\s|$|[：:])`).test(markdown);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
