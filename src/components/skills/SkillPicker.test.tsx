import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SkillPicker } from "./SkillPicker";
import type { Skill } from "@/lib/domain";

const skills: Skill[] = [
  {
    id: "writer-short",
    title: "自然短句",
    category: "风格",
    description: "草稿更自然。",
    prompt: "句子短一点。",
    appliesTo: "writer",
    isSystem: true,
    defaultEnabled: false,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "editor-logic",
    title: "逻辑链审查",
    category: "检查",
    description: "检查跳跃。",
    prompt: "找出因果链断点。",
    appliesTo: "editor",
    isSystem: true,
    defaultEnabled: true,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "shared-title",
    title: "标题不要夸张",
    category: "约束",
    description: "避免标题党。",
    prompt: "标题保持克制。",
    appliesTo: "both",
    isSystem: true,
    defaultEnabled: false,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  }
];

describe("SkillPicker", () => {
  it("groups skills and toggles selected ids", async () => {
    const onChange = vi.fn();
    render(<SkillPicker skills={skills} selectedSkillIds={["editor-logic"]} onChange={onChange} />);

    expect(screen.getByRole("group", { name: "草稿工作" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "判断工作" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "内容团队" })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "草稿工作" })).getByText("作用：内容更新")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "判断工作" })).getByText("作用：方向与检查")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "内容团队" })).getByText("作用：全程")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "判断工作" })).getByRole("checkbox", { name: /逻辑链审查/ })).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: /标题不要夸张/ }));

    expect(onChange).toHaveBeenCalledWith(["editor-logic", "shared-title"]);
  });

  it("orders content team skills by the creation workflow", () => {
    const contentTeamSkills: Skill[] = [
      contentTeamSkill("system-creator", "创作者", 0, { defaultLoaded: true }),
      contentTeamSkill("system-writer", "写手", 3, { parentSkillId: "system-creator" }),
      contentTeamSkill("system-publisher", "发布编辑", 5, { parentSkillId: "system-creator" }),
      contentTeamSkill("system-reviewer", "审稿", 4, { parentSkillId: "system-creator" }),
      contentTeamSkill("system-planner", "策划", 1, { parentSkillId: "system-creator" }),
      contentTeamSkill("system-researcher", "资料员", 2, { parentSkillId: "system-creator" })
    ];

    render(<SkillPicker skills={contentTeamSkills} selectedSkillIds={contentTeamSkills.map((skill) => skill.id)} onChange={vi.fn()} />);

    const contentTeamGroup = screen.getByRole("group", { name: "内容团队" });
    const creatorGroup = within(contentTeamGroup).getByRole("group", { name: "创作者" });
    const labels = within(creatorGroup).getAllByRole("checkbox").map((checkbox) => checkbox.closest("label")?.textContent);

    expect(labels).toEqual([
      expect.stringContaining("创作者"),
      expect.stringContaining("整体流程"),
      expect.stringContaining("策划"),
      expect.stringContaining("资料员"),
      expect.stringContaining("写手"),
      expect.stringContaining("审稿"),
      expect.stringContaining("发布编辑")
    ]);
  });

  it("lets users cancel a child skill without disabling the whole creator group", async () => {
    const contentTeamSkills: Skill[] = [
      contentTeamSkill("system-creator", "创作者", 0, { defaultLoaded: true }),
      contentTeamSkill("system-planner", "策划", 1, { parentSkillId: "system-creator" }),
      contentTeamSkill("system-researcher", "资料员", 2, { parentSkillId: "system-creator" })
    ];
    const onChange = vi.fn();

    render(<SkillPicker skills={contentTeamSkills} selectedSkillIds={contentTeamSkills.map((skill) => skill.id)} onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /资料员/ }));

    expect(onChange).toHaveBeenCalledWith(["system-creator", "system-planner"]);
  });
});

function contentTeamSkill(
  id: string,
  title: string,
  sortOrder: number,
  overrides: Partial<Skill> = {}
): Skill {
  return {
    id,
    title,
    category: "content-team",
    description: `${title}说明。`,
    prompt: `${title} prompt`,
    appliesTo: "both",
    isSystem: true,
    sortOrder,
    defaultEnabled: true,
    defaultLoaded: false,
    parentSkillId: null,
    isArchived: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides
  };
}
