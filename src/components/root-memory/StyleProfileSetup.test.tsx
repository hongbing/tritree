import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Skill } from "@/lib/domain";
import { StyleProfileSetup } from "./StyleProfileSetup";

const baseSkill: Skill = {
  id: "style-1",
  title: "我的风格：克制产品随笔",
  category: "风格",
  description: "短句、具体。",
  prompt: "使用短句，保留具体例子。",
  appliesTo: "writer",
  isSystem: false,
  defaultEnabled: false,
  isArchived: false,
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z"
};

const alternateSkill: Skill = {
  ...baseSkill,
  id: "style-2",
  title: "我的风格：产品观察"
};

const generatedDraft = {
  title: "我的风格：自然短句",
  category: "风格",
  description: "更自然的短句表达。",
  prompt: "使用自然短句，减少抽象形容。",
  appliesTo: "writer",
  defaultEnabled: false,
  isArchived: false
} as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

function renderSetup(props: Partial<ComponentProps<typeof StyleProfileSetup>> = {}) {
  return render(
    <StyleProfileSetup
      disabled={false}
      externalStyleGenerationAvailable={false}
      onCreateSkill={vi.fn(async () => ({
        ...generatedDraft,
        id: "style-new",
        isSystem: false,
        createdAt: "",
        updatedAt: ""
      }))}
      onSavedSkill={vi.fn()}
      onUpdateSkill={vi.fn(async () => ({ ...baseSkill, ...generatedDraft }))}
      selectedSkillIds={[]}
      skills={[]}
      {...props}
    />
  );
}

describe("StyleProfileSetup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders expanded method choices when no personal style exists", () => {
    renderSetup();

    expect(screen.getByRole("region", { name: "我的风格" })).toBeInTheDocument();
    expect(screen.getByText("你还没有配置个人风格。建议先设置，让 Tritree 优先按你的表达习惯生成内容。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动填写" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "一键生成我的风格" })).not.toBeInTheDocument();
  });

  it("renders collapsed when a selected personal style exists and can expand", async () => {
    renderSetup({ selectedSkillIds: ["style-1"], skills: [baseSkill] });

    expect(screen.getByText("正在使用：我的风格：克制产品随笔")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByText("选择一种方式更新或创建个人风格。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();
  });

  it("renders collapsed when a personal style exists but is not selected", async () => {
    renderSetup({ selectedSkillIds: [], skills: [baseSkill] });

    expect(screen.getByText("已有个人风格：我的风格：克制产品随笔")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "粘贴代表作生成" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(screen.getByText("选择一种方式更新或创建个人风格。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeInTheDocument();
  });

  it("shows one-click generation when the external provider is available", () => {
    renderSetup({ externalStyleGenerationAvailable: true });

    expect(screen.getByRole("button", { name: "一键生成我的风格" })).toBeInTheDocument();
  });

  it("collapses to the selected style summary when parent selects a personal style without active work", async () => {
    const { rerender } = renderSetup();

    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();

    rerender(
      <StyleProfileSetup
        disabled={false}
        externalStyleGenerationAvailable={false}
        onCreateSkill={vi.fn(async () => null)}
        onSavedSkill={vi.fn()}
        onUpdateSkill={vi.fn(async () => null)}
        selectedSkillIds={["style-1"]}
        skills={[baseSkill]}
      />
    );

    expect(await screen.findByText("正在使用：我的风格：克制产品随笔")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();
  });

  it("keeps a manually expanded sample editor open across parent skills refreshes", async () => {
    const { rerender } = renderSetup({ selectedSkillIds: ["style-1"], skills: [baseSkill] });

    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
    await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "这一段代表我的表达习惯。");

    rerender(
      <StyleProfileSetup
        disabled={false}
        externalStyleGenerationAvailable={false}
        onCreateSkill={vi.fn(async () => null)}
        onSavedSkill={vi.fn()}
        onUpdateSkill={vi.fn(async () => null)}
        selectedSkillIds={["style-1"]}
        skills={[{ ...baseSkill, updatedAt: "2026-05-13T01:00:00.000Z" }]}
      />
    );

    expect(screen.getByRole("button", { name: "暂不设置" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "代表作样本" })).toHaveValue("这一段代表我的表达习惯。");
  });

  it("generates from pasted samples and saves a new skill", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: generatedDraft })
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      id: "style-new",
      isSystem: false,
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z"
    }));
    const onSavedSkill = vi.fn();

    renderSetup({ onCreateSkill, onSavedSkill });

    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
    await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "第一段代表作。\n\n第二段代表作。");
    await userEvent.click(screen.getByRole("button", { name: "生成我的风格" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/skills/style/generate-from-samples",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: ["第一段代表作。", "第二段代表作。"] })
      })
    );
    expect(await screen.findByRole("textbox", { name: "风格名称" })).toHaveValue("我的风格：自然短句");

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onCreateSkill).toHaveBeenCalledWith(generatedDraft);
    expect(onSavedSkill).toHaveBeenCalledWith(expect.objectContaining({ id: "style-new" }));
  });

  it("generates from external provider and updates an existing style", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: generatedDraft })
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      id: "style-new",
      isSystem: false,
      createdAt: "",
      updatedAt: ""
    }));
    const onUpdateSkill = vi.fn(async () => ({ ...baseSkill, ...generatedDraft }));
    const onSavedSkill = vi.fn();

    renderSetup({
      externalStyleGenerationAvailable: true,
      onCreateSkill,
      onSavedSkill,
      onUpdateSkill,
      selectedSkillIds: ["style-1"],
      skills: [baseSkill]
    });

    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "一键生成我的风格" }));
    await screen.findByRole("textbox", { name: "风格名称" });

    expect(screen.getByRole("radio", { name: "更新已有风格" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "创建新版本" })).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/skills/style/generate-external",
      expect.objectContaining({ method: "POST" })
    );
    expect(onUpdateSkill).toHaveBeenCalledWith("style-1", generatedDraft);
    expect(onCreateSkill).not.toHaveBeenCalled();
    expect(onSavedSkill).toHaveBeenCalledWith(expect.objectContaining({ id: "style-1" }));
  });

  it("updates the save target when the selected personal style changes after generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: generatedDraft })
    });
    vi.stubGlobal("fetch", fetchMock);
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      id: "style-new",
      isSystem: false,
      createdAt: "",
      updatedAt: ""
    }));
    const onUpdateSkill = vi.fn(async () => ({ ...alternateSkill, ...generatedDraft }));
    const onSavedSkill = vi.fn();

    const { rerender } = renderSetup({
      externalStyleGenerationAvailable: true,
      onCreateSkill,
      onSavedSkill,
      onUpdateSkill,
      selectedSkillIds: ["style-1"],
      skills: [baseSkill, alternateSkill]
    });

    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "一键生成我的风格" }));
    await screen.findByRole("textbox", { name: "风格名称" });

    rerender(
      <StyleProfileSetup
        disabled={false}
        externalStyleGenerationAvailable={true}
        onCreateSkill={onCreateSkill}
        onSavedSkill={onSavedSkill}
        onUpdateSkill={onUpdateSkill}
        selectedSkillIds={["style-2"]}
        skills={[alternateSkill]}
      />
    );

    await waitFor(() => expect(screen.getByRole("combobox", { name: "选择要更新的风格" })).toHaveValue("style-2"));
    expect(screen.getByRole("textbox", { name: "风格名称" })).toHaveValue("我的风格：自然短句");

    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdateSkill).toHaveBeenCalledWith("style-2", generatedDraft);
    expect(onCreateSkill).not.toHaveBeenCalled();
    expect(onSavedSkill).toHaveBeenCalledWith(expect.objectContaining({ id: "style-2" }));
  });

  it("preserves external generation failure recovery and retries the external request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "外部风格服务暂时不可用。" })
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSetup({ externalStyleGenerationAvailable: true });

    await userEvent.click(screen.getByRole("button", { name: "一键生成我的风格" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("外部风格服务暂时不可用。");
    expect(screen.getByRole("button", { name: "重试生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回选择方式" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "重试生成" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/skills/style/generate-external",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("clears stale external errors when switching to sample generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "外部风格服务暂时不可用。" })
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSetup({ externalStyleGenerationAvailable: true });

    await userEvent.click(screen.getByRole("button", { name: "一键生成我的风格" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("外部风格服务暂时不可用。");
    expect(screen.getByRole("button", { name: "重试生成" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "返回选择方式" }));
    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成我的风格" })).toBeInTheDocument();
  });

  it("shows an alert when generated draft normalization fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ skillDraft: { title: "缺提示词" } })
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSetup();

    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
    await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "第一段代表作。");
    await userEvent.click(screen.getByRole("button", { name: "生成我的风格" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("生成的风格内容不完整。");
    expect(screen.queryByRole("textbox", { name: "风格名称" })).not.toBeInTheDocument();
  });

  it("shows save failures in an alert without marking the skill saved", async () => {
    const onCreateSkill = vi.fn(async () => null);
    const onSavedSkill = vi.fn();

    renderSetup({ onCreateSkill, onSavedSkill });

    await userEvent.click(screen.getByRole("button", { name: "手动填写" }));
    await userEvent.type(screen.getByRole("textbox", { name: "风格名称" }), "产品观察");
    await userEvent.type(screen.getByRole("textbox", { name: "风格提示词" }), "写作时具体、克制。");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("技能保存失败。");
    expect(onSavedSkill).not.toHaveBeenCalled();
  });

  it("disables controls from the disabled prop and while generation or save is in flight", async () => {
    const generation = deferred<{ ok: boolean; json: () => Promise<{ skillDraft: typeof generatedDraft }> }>();
    const fetchMock = vi.fn(() => generation.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderSetup({
      disabled: true,
      externalStyleGenerationAvailable: true
    });

    expect(screen.getByRole("button", { name: "暂不设置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "一键生成我的风格" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "粘贴代表作生成" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "手动填写" })).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: "代表作样本" })).not.toBeInTheDocument();

    rerender(
      <StyleProfileSetup
        disabled={false}
        externalStyleGenerationAvailable={true}
        onCreateSkill={vi.fn(async () => null)}
        onSavedSkill={vi.fn()}
        onUpdateSkill={vi.fn(async () => null)}
        selectedSkillIds={[]}
        skills={[]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "一键生成我的风格" }));

    expect(screen.getByRole("button", { name: "暂不设置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在一键生成..." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "粘贴代表作生成" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "手动填写" })).not.toBeInTheDocument();

    generation.resolve({ ok: true, json: async () => ({ skillDraft: generatedDraft }) });
    expect(await screen.findByRole("textbox", { name: "风格名称" })).toHaveValue("我的风格：自然短句");

    const save = deferred<Skill | null>();
    const onCreateSkill = vi.fn(() => save.promise);
    rerender(
      <StyleProfileSetup
        disabled={false}
        externalStyleGenerationAvailable={false}
        onCreateSkill={onCreateSkill}
        onSavedSkill={vi.fn()}
        onUpdateSkill={vi.fn(async () => null)}
        selectedSkillIds={[]}
        skills={[]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "返回选择方式" }));
    await userEvent.click(screen.getByRole("button", { name: "手动填写" }));
    await userEvent.type(screen.getByRole("textbox", { name: "风格名称" }), "产品观察");
    await userEvent.type(screen.getByRole("textbox", { name: "风格提示词" }), "写作时具体、克制。");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("button", { name: "暂不设置" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "风格名称" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "风格提示词" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正在保存..." })).toBeDisabled();

    save.resolve({
      ...generatedDraft,
      title: "我的风格：产品观察",
      prompt: "写作时具体、克制。",
      id: "style-new",
      isSystem: false,
      createdAt: "",
      updatedAt: ""
    });
  });

  it("defaults to creating when personal styles exist but none is selected", async () => {
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      id: "style-new",
      isSystem: false,
      createdAt: "",
      updatedAt: ""
    }));
    const onUpdateSkill = vi.fn(async () => ({ ...baseSkill, ...generatedDraft }));

    renderSetup({ onCreateSkill, onUpdateSkill, selectedSkillIds: [], skills: [baseSkill] });

    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await userEvent.click(screen.getByRole("button", { name: "手动填写" }));

    expect(screen.getByRole("radio", { name: "创建新版本" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "更新已有风格" })).not.toBeChecked();
    expect(screen.queryByRole("combobox", { name: "选择要更新的风格" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "更新已有风格" }));
    expect(screen.getByRole("combobox", { name: "选择要更新的风格" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "创建新版本" }));
    expect(screen.queryByRole("combobox", { name: "选择要更新的风格" })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "风格名称" }), "产品观察");
    await userEvent.type(screen.getByRole("textbox", { name: "风格提示词" }), "写作时具体、克制。");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onCreateSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "我的风格：产品观察",
        prompt: "写作时具体、克制。"
      })
    );
    expect(onUpdateSkill).not.toHaveBeenCalled();
  });

  it("preserves input and offers recovery after generation failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "样本太少，请再贴一段。" })
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSetup();

    await userEvent.click(screen.getByRole("button", { name: "粘贴代表作生成" }));
    await userEvent.type(screen.getByRole("textbox", { name: "代表作样本" }), "只有一句。");
    await userEvent.click(screen.getByRole("button", { name: "生成我的风格" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("样本太少，请再贴一段。");
    expect(screen.getByRole("textbox", { name: "代表作样本" })).toHaveValue("只有一句。");
    expect(screen.getByRole("button", { name: "重试生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返回选择方式" })).toBeInTheDocument();
  });

  it("lets the user edit a manual draft before saving", async () => {
    const onCreateSkill = vi.fn(async () => ({
      ...generatedDraft,
      title: "我的风格：产品观察",
      description: "具体、克制。",
      prompt: "写作时具体、克制。",
      id: "style-new",
      isSystem: false,
      createdAt: "",
      updatedAt: ""
    }));

    renderSetup({ onCreateSkill });

    await userEvent.click(screen.getByRole("button", { name: "手动填写" }));
    await userEvent.type(screen.getByRole("textbox", { name: "风格名称" }), "产品观察");
    await userEvent.type(screen.getByRole("textbox", { name: "风格说明" }), "具体、克制。");
    await userEvent.type(screen.getByRole("textbox", { name: "风格提示词" }), "写作时具体、克制。");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(onCreateSkill).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "我的风格：产品观察",
          description: "具体、克制。",
          prompt: "写作时具体、克制。"
        })
      )
    );
  });
});
