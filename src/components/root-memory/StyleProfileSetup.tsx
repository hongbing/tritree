"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_SKILL_PROMPT_LENGTH, type Skill, type SkillUpsert } from "@/lib/domain";
import {
  MY_STYLE_TITLE_PREFIX,
  isPersonalStyleSkill,
  normalizeGeneratedStyleDraft,
  splitRepresentativeSamples
} from "@/lib/skills/style-profile";

type GenerationMode = "external" | "samples";
type SaveMode = "create" | "update";

const emptyStyleDraft: SkillUpsert = {
  title: MY_STYLE_TITLE_PREFIX,
  category: "风格",
  description: "",
  prompt: "",
  appliesTo: "writer",
  defaultEnabled: false,
  isArchived: false
};

export function StyleProfileSetup({
  disabled,
  externalStyleGenerationAvailable,
  onCreateSkill,
  onSavedSkill,
  onUpdateSkill,
  selectedSkillIds,
  skills
}: {
  disabled: boolean;
  externalStyleGenerationAvailable: boolean;
  onCreateSkill: (input: SkillUpsert) => Promise<Skill | null>;
  onSavedSkill: (skill: Skill) => void;
  onUpdateSkill: (skillId: string, input: SkillUpsert) => Promise<Skill | null>;
  selectedSkillIds: string[];
  skills: Skill[];
}) {
  const personalStyleSkills = useMemo(() => skills.filter(isPersonalStyleSkill), [skills]);
  const selectedPersonalStyle = personalStyleSkills.find((skill) => selectedSkillIds.includes(skill.id)) ?? null;
  const [isExpanded, setIsExpanded] = useState(!selectedPersonalStyle);
  const [samplesText, setSamplesText] = useState("");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("samples");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SkillUpsert | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>(selectedPersonalStyle ? "update" : "create");
  const [updateSkillId, setUpdateSkillId] = useState(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
  const isBusy = disabled || isGenerating || isSaving;
  const hasActiveWork = Boolean(draft) || isGenerating || isSaving;

  useEffect(() => {
    const fallbackUpdateSkillId = selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "";

    setUpdateSkillId((current) => {
      if (!fallbackUpdateSkillId) return "";
      if (selectedPersonalStyle?.id && current !== selectedPersonalStyle.id) return selectedPersonalStyle.id;
      if (current && personalStyleSkills.some((skill) => skill.id === current)) return current;
      return fallbackUpdateSkillId;
    });

    if (hasActiveWork) return;

    if (selectedPersonalStyle) {
      setIsExpanded(false);
      setSaveMode("update");
    } else {
      setSaveMode("create");
    }
  }, [hasActiveWork, personalStyleSkills, selectedPersonalStyle]);

  async function generateFromSamples() {
    const samples = splitRepresentativeSamples(samplesText);
    if (samples.length === 0) {
      setError("请先粘贴至少一段代表作。");
      return;
    }

    await requestGeneration("samples", "/api/skills/style/generate-from-samples", { samples });
  }

  async function generateExternal() {
    await requestGeneration("external", "/api/skills/style/generate-external");
  }

  async function requestGeneration(mode: GenerationMode, url: string, body?: unknown) {
    setError("");
    setGenerationMode(mode);
    setIsGenerating(true);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; skillDraft?: unknown };
      if (!response.ok || !data.skillDraft) throw new Error(data.error ?? "无法生成我的风格。");

      setDraft(normalizeGeneratedStyleDraft(data.skillDraft));
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "技能保存失败。");
    } finally {
      setIsSaving(false);
    }
  }

  function startManualDraft() {
    setError("");
    setDraft({ ...emptyStyleDraft });
    setSaveMode(selectedPersonalStyle ? "update" : "create");
    setUpdateSkillId(selectedPersonalStyle?.id ?? personalStyleSkills[0]?.id ?? "");
  }

  function switchToSampleGeneration() {
    setError("");
    setGenerationMode("samples");
  }

  return (
    <section
      aria-label="我的风格"
      className={`style-profile-setup${isExpanded ? " style-profile-setup--expanded" : ""}`}
    >
      <header className="style-profile-setup__header">
        <div>
          <p className="eyebrow">我的风格</p>
          {selectedPersonalStyle && !isExpanded ? (
            <p className="style-profile-setup__summary">正在使用：{selectedPersonalStyle.title}</p>
          ) : (
            <p className="style-profile-setup__summary">生成个人风格 Skill，并自动用于这次作品。</p>
          )}
        </div>
        <button
          aria-expanded={isExpanded}
          className="secondary-button"
          disabled={isBusy}
          onClick={() => setIsExpanded((expanded) => !expanded)}
          type="button"
        >
          {isExpanded ? "收起我的风格设置" : "展开我的风格设置"}
        </button>
      </header>

      {isExpanded ? (
        <div className="style-profile-setup__body">
          {error ? (
            <p className="style-profile-setup__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="style-profile-setup__actions">
            {externalStyleGenerationAvailable ? (
              <button className="primary-action" disabled={isBusy} onClick={() => void generateExternal()} type="button">
                {isGenerating && generationMode === "external"
                  ? "正在一键生成..."
                  : error && generationMode === "external"
                    ? "重试生成"
                    : "一键生成我的风格"}
              </button>
            ) : null}
            <button
              className="secondary-button"
              disabled={isBusy}
              onClick={switchToSampleGeneration}
              type="button"
            >
              粘贴代表作生成
            </button>
            <button className="secondary-button" disabled={isBusy} onClick={startManualDraft} type="button">
              改为手动创建
            </button>
          </div>

          {generationMode === "samples" ? (
            <>
              <label className="style-profile-setup__samples">
                <span>代表作样本</span>
                <textarea
                  aria-label="代表作样本"
                  disabled={isBusy}
                  onChange={(event) => setSamplesText(event.target.value)}
                  placeholder="粘贴几段最像你的作品。用空行分隔多段样本。"
                  rows={5}
                  value={samplesText}
                />
              </label>
              <div className="style-profile-setup__generate-row">
                <button
                  className="secondary-button"
                  disabled={isBusy}
                  onClick={() => void generateFromSamples()}
                  type="button"
                >
                  {isGenerating && generationMode === "samples" ? "正在生成..." : error ? "重试生成" : "生成风格草稿"}
                </button>
              </div>
            </>
          ) : null}

          {draft ? (
            <section aria-label="风格草稿" className="style-profile-review">
              <label>
                <span>风格名称</span>
                <input
                  aria-label="风格名称"
                  disabled={isBusy}
                  maxLength={40}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, title: event.target.value } : current))
                  }
                  value={draft.title}
                />
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
                disabled={isBusy || !draft.title.trim() || !draft.prompt.trim()}
                onClick={() => void saveDraft()}
                type="button"
              >
                {isSaving ? "正在保存..." : "保存并用于本作品"}
              </button>
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
