import { describe, expect, it } from "vitest";
import {
  CONTENT_WORKFLOW_STAGES,
  buildContentWorkflowOptionInstructions
} from "./content-workflow";

describe("content workflow option instructions", () => {
  it("lists all soft content workflow stages used by the options agent", () => {
    expect(CONTENT_WORKFLOW_STAGES).toEqual([
      "clarify-intent",
      "choose-angle",
      "organize-material",
      "write-rewrite",
      "review-repair",
      "finish-publish"
    ]);
  });

  it("teaches the options agent to choose a stage before writing one question and three answers", () => {
    const instructions = buildContentWorkflowOptionInstructions();

    expect(instructions).toContain("# 内容工作流阶段");
    expect(instructions).toContain("这些阶段是内部判断线索，不要把英文阶段名暴露给用户");
    expect(instructions).toContain("澄清意图");
    expect(instructions).toContain("选择角度");
    expect(instructions).toContain("组织材料");
    expect(instructions).toContain("写作或改写");
    expect(instructions).toContain("审稿修补");
    expect(instructions).toContain("收口发布");
    expect(instructions).toContain("先判断当前内容最适合哪个阶段");
    expect(instructions).toContain("为该阶段生成一个 roundIntent 问题");
    expect(instructions).toContain("三个 options 必须是对同一个 roundIntent 的三个答案");
    expect(instructions).toContain("如果 seed 缺少读者、目的或期望效果，优先澄清意图");
    expect(instructions).toContain("如果草稿已经连贯且接近可发布，优先收口发布");
  });

  it("keeps the instruction product-neutral and compatible with existing fields", () => {
    const instructions = buildContentWorkflowOptionInstructions();

    expect(instructions).toContain("只使用现有输出字段表达判断：roundIntent、options[].label、options[].description、options[].impact");
    expect(instructions).toContain("description 写选择背后的诊断、取舍或处理口径");
    expect(instructions).toContain("impact 写选择后会让下一稿获得什么确定性");
    expect(instructions).not.toContain("workflow_stage");
    expect(instructions).not.toContain("stage_reason");
    expect(instructions).not.toContain("Superpowers");
    expect(instructions).not.toContain("三选一");
  });
});
