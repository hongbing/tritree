"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { MAX_SKILL_PROMPT_LENGTH, type Skill, type SkillUpsert } from "@/lib/domain";
import {
  MY_STYLE_TITLE_PREFIX,
  isPersonalStyleSkill,
  normalizeGeneratedStyleDraft
} from "@/lib/skills/style-profile";
import { createNdjsonParser } from "@/lib/stream/ndjson";

type GenerationMode = "external" | "samples";
type SaveMode = "create" | "update";
type SetupStep = "choose" | "external" | "review" | "samples";
type StyleDraftPreview = Partial<Pick<SkillUpsert, "description" | "prompt" | "title">>;
type StyleGenerationStreamEvent =
  | { type: "progress"; message: string }
  | { type: "draft"; skillDraft: unknown }
  | { type: "done"; skillDraft: unknown }
  | { type: "error"; error: string };

const emptyStyleDraft: SkillUpsert = {
  title: MY_STYLE_TITLE_PREFIX,
  category: "风格",
  description: "",
  prompt: "",
  appliesTo: "both",
  defaultEnabled: true,
  isArchived: false
};
const initialSampleTexts = [""];
const MAX_REPRESENTATIVE_SAMPLE_COUNT = 5;

export function StyleProfileSetup({
  disabled,
  externalStyleGenerationAvailable,
  isInline = false,
  onCreateSkill,
  onSavedSkill,
  onUpdateSkill,
  selectedSkillIds,
  skills
}: {
  disabled: boolean;
  externalStyleGenerationAvailable: boolean;
  isInline?: boolean;
  onCreateSkill: (input: SkillUpsert) => Promise<Skill | null>;
  onSavedSkill: (skill: Skill) => void;
  onUpdateSkill: (skillId: string, input: SkillUpsert) => Promise<Skill | null>;
  selectedSkillIds: string[];
  skills: Skill[];
}) {
  const personalStyleSkills = useMemo(() => skills.filter(isPersonalStyleSkill), [skills]);
  const hasPersonalStyles = personalStyleSkills.length > 0;
  const selectedPersonalStyle = personalStyleSkills.find((skill) => selectedSkillIds.includes(skill.id)) ?? null;
  const collapsedPersonalStyle = selectedPersonalStyle ?? personalStyleSkills[0] ?? null;
  const sampleFieldIdPrefix = useId();
  const [isExpanded, setIsExpanded] = useState(!hasPersonalStyles);
  const [step, setStep] = useState<SetupStep>("choose");
  const [sampleTexts, setSampleTexts] = useState<string[]>(initialSampleTexts);
  const [generationMode, setGenerationMode] = useState<GenerationMode>("samples");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SkillUpsert | null>(null);
  const [generationMessage, setGenerationMessage] = useState("");
  const [streamingDraft, setStreamingDraft] = useState<StyleDraftPreview | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>(selectedPersonalStyle ? "update" : "create");
  const [updateSkillId, setUpdateSkillId] = useState(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
  const [hasUserExpanded, setHasUserExpanded] = useState(false);
  const isBusy = disabled || isGenerating || isSaving;
  const shouldShowInlineCompactStyle = Boolean(isInline && hasPersonalStyles && !isExpanded && collapsedPersonalStyle);
  const inlineCompactStyleTitle = collapsedPersonalStyle ? compactPersonalStyleTitle(collapsedPersonalStyle.title) : "";
  const hasActiveWork =
    Boolean(draft) ||
    sampleTexts.some((sample) => sample.trim().length > 0) ||
    step !== "choose" ||
    hasUserExpanded ||
    isGenerating ||
    isSaving;

  useEffect(() => {
    const fallbackUpdateSkillId = selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "";

    setUpdateSkillId((current) => {
      if (!fallbackUpdateSkillId) return "";
      if (selectedPersonalStyle?.id && current !== selectedPersonalStyle.id) return selectedPersonalStyle.id;
      if (current && personalStyleSkills.some((skill) => skill.id === current)) return current;
      return fallbackUpdateSkillId;
    });

    if (hasActiveWork) return;

    if (hasPersonalStyles) {
      setIsExpanded(false);
      setHasUserExpanded(false);
      setSaveMode(selectedPersonalStyle ? "update" : "create");
    } else {
      setSaveMode("create");
    }
  }, [hasActiveWork, hasPersonalStyles, personalStyleSkills, selectedPersonalStyle]);

  async function generateFromSamples() {
    const samples = normalizedSampleTexts(sampleTexts);
    if (samples.length === 0) {
      setError("请先粘贴至少一段代表作。");
      return;
    }

    await requestGeneration("samples", "/api/skills/style/generate-from-samples", { samples });
  }

  async function generateExternal() {
    setStep("external");
    await requestGeneration("external", "/api/skills/style/generate-external");
  }

  async function requestGeneration(mode: GenerationMode, url: string, body?: unknown) {
    setError("");
    setGenerationMessage("");
    setStreamingDraft(null);
    setGenerationMode(mode);
    setIsGenerating(true);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      if (shouldConsumeStyleGenerationStream(mode, response)) {
        await consumeStyleGenerationStream(response);
        return;
      }

      const data = (await response.json().catch(() => ({}))) as { error?: string; skillDraft?: unknown };
      if (!response.ok || !data.skillDraft) throw new Error(data.error ?? "无法生成我的风格。");

      setDraft(normalizeGeneratedStyleDraft(data.skillDraft));
      setStep("review");
      setSaveMode(selectedPersonalStyle ? "update" : "create");
      setUpdateSkillId(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法生成我的风格。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;

    setError("");
    setIsSaving(true);

    try {
      const normalizedDraft = normalizeGeneratedStyleDraft(draft);
      const savedSkill =
        saveMode === "update" && updateSkillId
          ? await onUpdateSkill(updateSkillId, normalizedDraft)
          : await onCreateSkill(normalizedDraft);

      if (!savedSkill) throw new Error("技能保存失败。");
      onSavedSkill(savedSkill);
      setIsExpanded(false);
      setHasUserExpanded(false);
      setStep("choose");
    } catch (error) {
      setError(error instanceof Error ? error.message : "技能保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  function startManualDraft() {
    setError("");
    setGenerationMessage("");
    setStreamingDraft(null);
    setDraft({ ...emptyStyleDraft });
    setStep("review");
    setGenerationMode("samples");
    setSaveMode(selectedPersonalStyle ? "update" : "create");
    setUpdateSkillId(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
  }

  function startSampleGeneration() {
    setError("");
    setGenerationMessage("");
    setStreamingDraft(null);
    setDraft(null);
    setSampleTexts((current) => (current.length > 0 ? current : [...initialSampleTexts]));
    setGenerationMode("samples");
    setStep("samples");
  }

  function addSampleText() {
    setSampleTexts((current) => {
      if (current.length >= MAX_REPRESENTATIVE_SAMPLE_COUNT) return current;
      return [...current, ""];
    });
  }

  function removeSampleText(index: number) {
    setSampleTexts((current) => {
      if (current.length <= 1) return [...initialSampleTexts];
      return current.filter((_, sampleIndex) => sampleIndex !== index);
    });
  }

  function updateSampleText(index: number, value: string) {
    setSampleTexts((current) => current.map((sample, sampleIndex) => (sampleIndex === index ? value : sample)));
  }

  function returnToMethodSelection() {
    setError("");
    setGenerationMessage("");
    setStreamingDraft(null);
    setGenerationMode("samples");
    setStep("choose");
  }

  async function consumeStyleGenerationStream(response: Response) {
    if (!response.body) throw new Error("无法生成我的风格。");

    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let finalDraft: SkillUpsert | null = null;
    let streamError = "";
    let stoppedAfterTerminalEvent = false;
    const parser = createNdjsonParser((value) => {
      if (!isStyleGenerationStreamEvent(value)) return;

      if (value.type === "progress") {
        setGenerationMessage(value.message);
        return;
      }

      if (value.type === "draft") {
        const preview = styleDraftPreviewFrom(value.skillDraft);
        if (preview) {
          setStreamingDraft((current) => ({ ...(current ?? {}), ...preview }));
        }
        return;
      }

      if (value.type === "done") {
        finalDraft = normalizeGeneratedStyleDraft(value.skillDraft);
        return;
      }

      streamError = value.error;
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
        if (finalDraft || streamError) {
          stoppedAfterTerminalEvent = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
      if (!stoppedAfterTerminalEvent) {
        parser.push(decoder.decode());
        parser.flush();
      }
    } finally {
      reader.releaseLock();
    }

    if (streamError) throw new Error(streamError);
    if (!finalDraft) throw new Error("无法生成我的风格。");

    setDraft(finalDraft);
    setStep("review");
    setSaveMode(selectedPersonalStyle ? "update" : "create");
    setUpdateSkillId(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
  }

  function toggleExpanded() {
    setIsExpanded((expanded) => {
      const nextExpanded = !expanded;
      setHasUserExpanded(nextExpanded);
      return nextExpanded;
    });
  }

  return (
    <section
      aria-label="我的风格"
      className={[
        "style-profile-setup",
        isExpanded ? "style-profile-setup--expanded" : "",
        isInline ? "style-profile-setup--inline" : "",
        hasPersonalStyles ? "style-profile-setup--set" : "style-profile-setup--unset"
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {shouldShowInlineCompactStyle ? (
        <button
          aria-expanded={isExpanded}
          aria-label={`展开我的风格设置：${inlineCompactStyleTitle}`}
          className="style-profile-setup__compact-button"
          disabled={isBusy}
          onClick={toggleExpanded}
          type="button"
        >
          <span className="style-profile-setup__compact-label">我的风格</span>
          <span className="style-profile-setup__compact-value">{inlineCompactStyleTitle}</span>
        </button>
      ) : (
        <header className="style-profile-setup__header">
          <div>
            <p className="eyebrow">我的风格</p>
            {selectedPersonalStyle && !isExpanded ? (
              <p className="style-profile-setup__summary">正在使用：{selectedPersonalStyle.title}</p>
            ) : collapsedPersonalStyle && !isExpanded ? (
              <p className="style-profile-setup__summary">已有个人风格：{collapsedPersonalStyle.title}</p>
            ) : hasPersonalStyles ? (
              <p className="style-profile-setup__summary">选择一种方式更新或创建个人风格。</p>
            ) : (
              <p className="style-profile-setup__summary">
                你还没有配置个人风格。建议先设置，让 Tritree 优先按你的表达习惯生成内容。
              </p>
            )}
          </div>
          {!isExpanded ? (
            <button
              aria-expanded={isExpanded}
              className={hasPersonalStyles ? "style-profile-setup__update-button" : "secondary-button"}
              disabled={isBusy}
              onClick={toggleExpanded}
              type="button"
            >
              {hasPersonalStyles ? "更新" : "设置"}
            </button>
          ) : null}
        </header>
      )}

      {isExpanded ? (
        <div className="style-profile-setup__body">
          {error ? (
            <p className="style-profile-setup__error" role="alert">
              {error}
            </p>
          ) : null}

          {step !== "choose" ? (
            <div className="style-profile-setup__nav">
              <button className="secondary-button" disabled={isBusy} onClick={returnToMethodSelection} type="button">
                返回选择方式
              </button>
            </div>
          ) : null}

          {step === "choose" ? (
            <div className="style-profile-methods">
              {externalStyleGenerationAvailable ? (
                <button
                  aria-label="一键生成我的风格"
                  className="style-profile-method"
                  disabled={isBusy}
                  onClick={() => void generateExternal()}
                  type="button"
                >
                  <span>一键生成我的风格</span>
                  <small>从已接入的外部 AI 获取你的风格。</small>
                </button>
              ) : null}
              <button
                aria-label="粘贴代表作生成"
                className="style-profile-method"
                disabled={isBusy}
                onClick={startSampleGeneration}
                type="button"
              >
                <span>粘贴代表作生成</span>
                <small>适合直接粘贴自己的作品内容，Tritree 会归纳表达习惯。</small>
              </button>
              <button
                aria-label="手动填写"
                className="style-profile-method"
                disabled={isBusy}
                onClick={startManualDraft}
                type="button"
              >
                <span>手动填写</span>
                <small>适合你已经知道自己想要的风格提示词。</small>
              </button>
            </div>
          ) : null}

          {step === "external" ? (
            <div className="style-profile-setup__generate-row">
              <p className="style-profile-setup__step-copy">正在从外部 AI 获取你的风格。</p>
              <button
                className="primary-action"
                disabled={isBusy}
                onClick={() => void generateExternal()}
                type="button"
              >
                {isGenerating ? "正在一键生成..." : error ? "重试生成" : "一键生成我的风格"}
              </button>
            </div>
          ) : null}

          {step === "samples" ? (
            <>
              <div className="style-profile-sample-guidance">
                <p>建议添加 2-5 段代表作，每段 200-1000 字；一格贴一篇或一条。</p>
              </div>
              <div className="style-profile-sample-list">
                {sampleTexts.map((sampleText, index) => {
                  const label = `代表作 ${index + 1}`;
                  const sampleFieldId = `${sampleFieldIdPrefix}-sample-${index}`;

                  return (
                    <div className="style-profile-sample-item" key={index}>
                      <div className="style-profile-sample-item__header">
                        <label htmlFor={sampleFieldId}>{label}</label>
                        <div className="style-profile-sample-item__meta">
                          <span>{sampleCharCount(sampleText)} 字</span>
                          {sampleTexts.length > 1 ? (
                            <button
                              aria-label={`删除${label}`}
                              className="style-profile-sample-item__remove"
                              disabled={isBusy}
                              onClick={() => removeSampleText(index)}
                              type="button"
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <textarea
                        aria-label={label}
                        disabled={isBusy}
                        id={sampleFieldId}
                        onChange={(event) => updateSampleText(index, event.target.value)}
                        placeholder="粘贴一篇或一条你觉得最像自己的内容。"
                        rows={5}
                        value={sampleText}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="style-profile-sample-actions">
                <p className="style-profile-sample-summary">{sampleSummaryText(sampleTexts)}</p>
                <div className="style-profile-sample-actions__buttons">
                  <button
                    className="secondary-button"
                    disabled={isBusy || sampleTexts.length >= MAX_REPRESENTATIVE_SAMPLE_COUNT}
                    onClick={addSampleText}
                    type="button"
                  >
                    {sampleTexts.length >= MAX_REPRESENTATIVE_SAMPLE_COUNT ? "最多 5 段" : "添加一段代表作"}
                  </button>
                  <button
                    className="primary-action"
                    disabled={isBusy}
                    onClick={() => void generateFromSamples()}
                    type="button"
                  >
                    {isGenerating && generationMode === "samples" ? "正在生成..." : error ? "重试生成" : "生成我的风格"}
                  </button>
                </div>
              </div>
              {isGenerating || streamingDraft ? (
                <section aria-label="生成中的风格草稿" className="style-profile-stream-preview">
                  <p className="style-profile-stream-preview__status" role="status">
                    {generationMessage || "正在生成我的风格..."}
                  </p>
                  {streamingDraft ? (
                    <div className="style-profile-stream-preview__fields">
                      {streamingDraft.title ? (
                        <div>
                          <span>风格名称</span>
                          <p>{streamingDraft.title}</p>
                        </div>
                      ) : null}
                      {streamingDraft.description ? (
                        <div>
                          <span>风格说明</span>
                          <p>{streamingDraft.description}</p>
                        </div>
                      ) : null}
                      {streamingDraft.prompt ? (
                        <div>
                          <span>风格提示词</span>
                          <p>{streamingDraft.prompt}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          ) : null}

          {step === "review" && draft ? (
            <section aria-label="风格草稿" className="style-profile-review">
              <label>
                <span>风格名称</span>
                <div className="style-profile-title-field">
                  <span aria-hidden="true" className="style-profile-title-field__prefix">
                    {MY_STYLE_TITLE_PREFIX}
                  </span>
                  <input
                    aria-label="风格名称"
                    disabled={isBusy}
                    maxLength={40 - MY_STYLE_TITLE_PREFIX.length}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, title: personalStyleTitleFromEditableValue(event.target.value) } : current
                      )
                    }
                    value={editablePersonalStyleTitle(draft.title)}
                  />
                </div>
              </label>
              <label>
                <span>风格说明</span>
                <textarea
                  aria-label="风格说明"
                  disabled={isBusy}
                  maxLength={240}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, description: event.target.value } : current))
                  }
                  rows={2}
                  value={draft.description}
                />
              </label>
              <label>
                <span>风格提示词</span>
                <textarea
                  aria-label="风格提示词"
                  disabled={isBusy}
                  maxLength={MAX_SKILL_PROMPT_LENGTH}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, prompt: event.target.value } : current))
                  }
                  rows={5}
                  value={draft.prompt}
                />
              </label>

              {personalStyleSkills.length > 0 ? (
                <fieldset className="style-profile-review__save-mode">
                  <legend>保存方式</legend>
                  <label>
                    <input
                      checked={saveMode === "update"}
                      disabled={isBusy}
                      name="style-save-mode"
                      onChange={() => setSaveMode("update")}
                      type="radio"
                    />
                    <span>更新已有风格</span>
                  </label>
                  <label>
                    <input
                      checked={saveMode === "create"}
                      disabled={isBusy}
                      name="style-save-mode"
                      onChange={() => setSaveMode("create")}
                      type="radio"
                    />
                    <span>创建新版本</span>
                  </label>
                  {saveMode === "update" ? (
                    <select
                      aria-label="选择要更新的风格"
                      disabled={isBusy}
                      onChange={(event) => setUpdateSkillId(event.target.value)}
                      value={updateSkillId}
                    >
                      {personalStyleSkills.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.title}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </fieldset>
              ) : null}

              <button
                className="primary-action"
                disabled={isBusy || !editablePersonalStyleTitle(draft.title).trim() || !draft.prompt.trim()}
                onClick={() => void saveDraft()}
                type="button"
              >
                {isSaving ? "正在保存..." : "保存"}
              </button>
            </section>
          ) : null}

          <div className="style-profile-setup__skip">
            <button
              aria-expanded={isExpanded}
              className="secondary-button"
              disabled={isBusy}
              onClick={toggleExpanded}
              type="button"
            >
              暂不设置
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function editablePersonalStyleTitle(title: string) {
  const trimmed = title.trim();
  return trimmed.startsWith(MY_STYLE_TITLE_PREFIX) ? trimmed.slice(MY_STYLE_TITLE_PREFIX.length) : trimmed;
}

function personalStyleTitleFromEditableValue(value: string) {
  const trimmed = value.replace(new RegExp(`^${escapeRegExp(MY_STYLE_TITLE_PREFIX)}\\s*`), "");
  return `${MY_STYLE_TITLE_PREFIX}${trimmed}`;
}

function compactPersonalStyleTitle(title: string) {
  return editablePersonalStyleTitle(title).trim() || title.trim();
}

function normalizedSampleTexts(sampleTexts: string[]) {
  return sampleTexts.map((sample) => sample.trim()).filter(Boolean);
}

function sampleCharCount(sampleText: string) {
  return sampleText.replace(/\s/g, "").length;
}

function sampleSummaryText(sampleTexts: string[]) {
  const samples = normalizedSampleTexts(sampleTexts);
  const totalChars = samples.reduce((sum, sample) => sum + sampleCharCount(sample), 0);

  if (sampleTexts.length >= MAX_REPRESENTATIVE_SAMPLE_COUNT && samples.length === 0) {
    return "已添加 0 段，共 0 字。最多添加 5 段代表作。";
  }
  if (samples.length === 0) return "已添加 0 段，共 0 字。先贴一段代表作开始。";
  if (sampleTexts.length >= MAX_REPRESENTATIVE_SAMPLE_COUNT) {
    return `已添加 ${samples.length} 段，共 ${totalChars} 字。最多添加 5 段代表作。`;
  }

  return `已添加 ${samples.length} 段，共 ${totalChars} 字。你可以继续添加代表段落。`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldConsumeStyleGenerationStream(mode: GenerationMode, response: Response) {
  if (!response.body) return false;
  if (response.headers.get("Content-Type")?.includes("application/x-ndjson")) return true;
  return mode === "samples" && response.ok;
}

function isStyleGenerationStreamEvent(value: unknown): value is StyleGenerationStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "progress":
      return typeof value.message === "string";
    case "draft":
    case "done":
      return "skillDraft" in value;
    case "error":
      return typeof value.error === "string";
    default:
      return false;
  }
}

function styleDraftPreviewFrom(value: unknown): StyleDraftPreview | null {
  if (!isRecord(value)) return null;
  const preview: StyleDraftPreview = {};

  if (typeof value.title === "string" && value.title.trim()) {
    preview.title = withPersonalStyleTitlePrefix(value.title);
  }
  if (typeof value.description === "string" && value.description.trim()) {
    preview.description = value.description.trim();
  }
  if (typeof value.prompt === "string" && value.prompt.trim()) {
    preview.prompt = value.prompt.trim();
  }

  return Object.keys(preview).length ? preview : null;
}

function withPersonalStyleTitlePrefix(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith(MY_STYLE_TITLE_PREFIX)) return trimmed;
  return `${MY_STYLE_TITLE_PREFIX}${trimmed}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
