import { beforeEach, describe, expect, it, vi } from "vitest";
import { StyleProfileGenerationError } from "@/lib/skills/style-profile";
import { generateStyleFromSamples } from "./style-profile-generator";

const mocks = vi.hoisted(() => ({
  agentConstructor: vi.fn(),
  createAnthropic: vi.fn()
}));

vi.mock("@mastra/core/agent", () => ({
  Agent: mocks.agentConstructor
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mocks.createAnthropic
}));

const modelFactory = vi.fn((modelId: string) => ({ modelId }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAnthropic.mockReturnValue(modelFactory);
  mocks.agentConstructor.mockImplementation(function FakeAgent(options) {
    return {
      options,
      generate: vi.fn(async () => ({
        object: {
          title: "克制产品随笔",
          description: "短句、具体、少夸张。",
          prompt: "写作时使用短句，保留具体例子，避免夸张承诺。"
        }
      }))
    };
  });
});

describe("generateStyleFromSamples", () => {
  it("rejects empty samples before calling the model", async () => {
    await expect(generateStyleFromSamples({ samples: [" ", "\n"] })).rejects.toThrow("请先粘贴至少一段代表作。");
    expect(mocks.agentConstructor).not.toHaveBeenCalled();
  });

  it("builds a Mastra agent and normalizes the returned skill draft", async () => {
    const draft = await generateStyleFromSamples({
      env: { KIMI_API_KEY: "token" },
      samples: ["第一段代表作。", "第二段代表作。"]
    });

    expect(mocks.agentConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tritree-style-profile-agent",
        name: "Tritree Style Profile Agent",
        instructions: expect.stringContaining("归纳用户写作风格")
      })
    );
    const agentInstance = mocks.agentConstructor.mock.results[0].value as { generate: ReturnType<typeof vi.fn> };
    expect(agentInstance.generate).toHaveBeenCalledWith(
      [expect.objectContaining({ role: "user", content: expect.stringContaining("样本 1") })],
      expect.objectContaining({
        structuredOutput: expect.objectContaining({ jsonPromptInjection: true })
      })
    );
    expect(draft).toEqual({
      title: "我的风格：克制产品随笔",
      category: "风格",
      description: "短句、具体、少夸张。",
      prompt: "写作时使用短句，保留具体例子，避免夸张承诺。",
      appliesTo: "writer",
      defaultEnabled: false,
      isArchived: false
    });
  });

  it("uses an injected style agent without constructing a Mastra agent or Anthropic model", async () => {
    const styleAgent = {
      generate: vi.fn(async () => ({
        object: {
          title: "内部测试风格",
          description: "测试双替代真实模型。",
          prompt: "保持测试里的具体表达。"
        }
      }))
    };

    const draft = await generateStyleFromSamples({
      samples: ["只需要这段样本。"],
      styleAgent
    });

    expect(mocks.agentConstructor).not.toHaveBeenCalled();
    expect(mocks.createAnthropic).not.toHaveBeenCalled();
    expect(styleAgent.generate).toHaveBeenCalledWith(
      [expect.objectContaining({ role: "user", content: expect.stringContaining("样本 1") })],
      expect.objectContaining({
        structuredOutput: expect.objectContaining({ jsonPromptInjection: true })
      })
    );
    expect(draft).toEqual({
      title: "我的风格：内部测试风格",
      category: "风格",
      description: "测试双替代真实模型。",
      prompt: "保持测试里的具体表达。",
      appliesTo: "writer",
      defaultEnabled: false,
      isArchived: false
    });
  });

  it("normalizes output fallback when object is absent", async () => {
    const draft = await generateStyleFromSamples({
      samples: ["一段代表作。"],
      styleAgent: {
        generate: vi.fn(async () => ({
          output: {
            title: "输出回退风格",
            description: "从 output 读取。",
            prompt: "正常归一化 output 字段里的草稿。"
          }
        }))
      }
    });

    expect(draft).toEqual({
      title: "我的风格：输出回退风格",
      category: "风格",
      description: "从 output 读取。",
      prompt: "正常归一化 output 字段里的草稿。",
      appliesTo: "writer",
      defaultEnabled: false,
      isArchived: false
    });
  });

  it("passes a structured output schema object to the agent", async () => {
    const styleAgent = {
      generate: vi.fn(async () => ({
        object: {
          title: "结构化输出",
          description: "包含 schema。",
          prompt: "调用模型时提供结构化输出 schema。"
        }
      }))
    };

    await generateStyleFromSamples({
      samples: ["一段代表作。"],
      styleAgent
    });

    expect(styleAgent.generate).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        structuredOutput: expect.objectContaining({
          jsonPromptInjection: true,
          schema: expect.any(Object)
        })
      })
    );
  });

  it("wraps plain upstream errors in a stable style profile error", async () => {
    const styleAgent = {
      generate: vi.fn(async () => {
        throw new Error("upstream failed");
      })
    };

    let thrown: unknown;
    try {
      await generateStyleFromSamples({
        samples: ["一段代表作。"],
        styleAgent
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StyleProfileGenerationError);
    expect(thrown).toMatchObject({
      message: "无法生成我的风格。",
      status: 500
    });
  });

  it("preserves StyleProfileGenerationError thrown during normalization", async () => {
    let thrown: unknown;
    try {
      await generateStyleFromSamples({
        samples: ["一段代表作。"],
        styleAgent: {
          generate: vi.fn(async () => ({
            object: {
              title: "缺少 prompt",
              description: "归一化会拒绝。"
            }
          }))
        }
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StyleProfileGenerationError);
    expect(thrown).toMatchObject({
      message: "生成的风格内容不完整。",
      status: 502
    });
  });
});
