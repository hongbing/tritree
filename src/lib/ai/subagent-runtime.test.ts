import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubagentTask } from "./subagent-runtime";
import { createSubagentRuntimeTools, runSubagentTaskWithModel } from "./subagent-runtime";

const mockGenerate = vi.fn();
const mockAgentConstructor = vi.fn();

vi.mock("@mastra/core/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mastra/core/agent")>();
  return {
    ...actual,
    Agent: vi.fn(
      class {
        generate = mockGenerate;

        constructor(options: unknown) {
          mockAgentConstructor(options);
        }
      }
    )
  };
});

vi.mock("./mastra-agents", () => ({
  createTreeableAnthropicModel: vi.fn(() => "mock-model")
}));

type ExecutableTool = {
  execute: (input: Record<string, unknown>, context: Record<string, unknown>) => Promise<unknown>;
};

function executableTool(tool: unknown) {
  if (!tool || typeof tool !== "object" || typeof (tool as { execute?: unknown }).execute !== "function") {
    throw new Error("Expected runtime tool to expose execute.");
  }

  return tool as ExecutableTool;
}

describe("subagent runtime tools", () => {
  beforeEach(() => {
    mockGenerate.mockReset();
    mockAgentConstructor.mockClear();
  });

  it("exposes template and temporary subagent tools with summaries", () => {
    const runtime = createSubagentRuntimeTools({
      runSubagentTask: async () => "unused"
    });

    expect(Object.keys(runtime.tools)).toEqual(["run_subagent_template", "run_temporary_subagent"]);
    expect(runtime.subagentTemplateSummaries).toHaveLength(1);
    expect(runtime.toolSummaries.join("\n")).toContain("run_subagent_template");
    expect(runtime.toolSummaries.join("\n")).toContain("run_temporary_subagent");
  });

  it("runs a selected template with fallback expected output", async () => {
    const calls: SubagentTask[] = [];
    const controller = new AbortController();
    const runtime = createSubagentRuntimeTools({
      env: { KIMI_API_KEY: "test-token" },
      runSubagentTask: vi.fn(async (task) => {
        calls.push(task);
        return "search result";
      })
    });

    const result = await executableTool(runtime.tools.run_subagent_template).execute(
      {
        templateId: "material-search",
        task: "找三条资料",
        context: "主题：周末短途旅行"
      },
      { abortSignal: controller.signal }
    );

    expect(result).toEqual({
      ok: true,
      result: "search result",
      templateId: "material-search",
      title: "素材搜索"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      context: "主题：周末短途旅行",
      env: { KIMI_API_KEY: "test-token" },
      expectedOutput: "资料清单：每条包含来源、要点、可用角度和可信度提示。",
      task: "找三条资料",
      template: expect.objectContaining({ id: "material-search", title: "素材搜索" }),
      title: "素材搜索",
      abortSignal: controller.signal
    });
  });

  it("runs a selected template with expected output override", async () => {
    const runSubagentTask = vi.fn(async () => "rewrite result");
    const runtime = createSubagentRuntimeTools({ runSubagentTask });

    await executableTool(runtime.tools.run_subagent_template).execute(
      {
        templateId: "platform-rewrite",
        task: "改写为两个平台版本",
        context: "原稿",
        expectedOutput: "只返回两个版本"
      },
      {}
    );

    expect(runSubagentTask).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOutput: "只返回两个版本",
        template: expect.objectContaining({ id: "platform-rewrite" })
      })
    );
  });

  it("runs a temporary subagent with constraints", async () => {
    const calls: SubagentTask[] = [];
    const controller = new AbortController();
    const runtime = createSubagentRuntimeTools({
      env: { TRITREE_MAX_OUTPUT_TOKENS: "1234" },
      runSubagentTask: async (task) => {
        calls.push(task);
        return "temporary result";
      }
    });

    const result = await executableTool(runtime.tools.run_temporary_subagent).execute(
      {
        title: "事实核查",
        task: "检查这段话是否自洽",
        context: "待审文本",
        expectedOutput: "列出问题和建议",
        constraints: "不要扩写正文"
      },
      { abortSignal: controller.signal }
    );

    expect(result).toEqual({
      ok: true,
      result: "temporary result",
      title: "事实核查"
    });
    expect(calls).toEqual([
      {
        constraints: "不要扩写正文",
        context: "待审文本",
        env: { TRITREE_MAX_OUTPUT_TOKENS: "1234" },
        expectedOutput: "列出问题和建议",
        task: "检查这段话是否自洽",
        template: undefined,
        title: "事实核查",
        abortSignal: controller.signal
      }
    ]);
  });

  it("passes abortSignal to the default Mastra agent generate call", async () => {
    const controller = new AbortController();
    mockGenerate.mockResolvedValueOnce({ text: "model result" });

    const result = await runSubagentTaskWithModel({
      abortSignal: controller.signal,
      context: "背景",
      env: { KIMI_API_KEY: "test-token" },
      expectedOutput: "输出",
      task: "任务",
      title: "临时子代理"
    });

    expect(result).toBe("model result");
    expect(mockAgentConstructor).toHaveBeenCalledWith(expect.objectContaining({ model: "mock-model" }));
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.stringContaining("任务") })]),
      { abortSignal: controller.signal }
    );
  });
});
