import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
