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
});
