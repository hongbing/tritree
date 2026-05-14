import { describe, expect, it } from "vitest";
import { z } from "zod";
import { badRequestResponse, publicServerErrorMessage } from "./errors";

describe("badRequestResponse", () => {
  it("returns a stable 400 response for invalid JSON", async () => {
    const response = badRequestResponse(new SyntaxError("Unexpected token }"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "请求不是有效的 JSON。" });
  });

  it("returns a stable 400 response with issues for Zod validation errors", async () => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse({ name: "" });
    if (parsed.success) {
      throw new Error("Expected validation to fail.");
    }

    const response = badRequestResponse(parsed.error);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("请求内容格式不正确。");
    expect(body.issues).toEqual(parsed.error.issues);
  });
});

describe("publicServerErrorMessage", () => {
  it("surfaces safe configuration messages through the generic mechanism", () => {
    expect(publicServerErrorMessage(new Error("KIMI_API_KEY is not configured."), "无法启动创作。")).toBe(
      "无法启动创作：KIMI_API_KEY is not configured."
    );
  });

  it("hides structured upstream errors behind the fallback", () => {
    expect(
      publicServerErrorMessage(
        { code: "insufficient_quota", message: "You exceeded your current quota.", status: 429 },
        "无法启动创作。"
      )
    ).toBe("无法启动创作。");
  });

  it("hides retry timing and provider messages from upstream errors", () => {
    expect(
      publicServerErrorMessage(
        {
          name: "AI_APICallError",
          statusCode: 429,
          responseHeaders: { "retry-after": "60" },
          data: {
            type: "error",
            error: {
              type: "engine_overloaded_error",
              message: "The engine is currently overloaded, please try again later"
            }
          },
          message: "The engine is currently overloaded, please try again later"
        },
        "无法启动创作。"
      )
    ).toBe("无法启动创作。");
  });

  it("hides authentication failures instead of exposing raw provider text", () => {
    expect(
      publicServerErrorMessage({ code: "authentication_error", message: "invalid token", status: 401 }, "无法启动创作。")
    ).toBe("无法启动创作。");
  });

  it("hides generic script failure output from public errors", () => {
    expect(
      publicServerErrorMessage({ exitCode: 2, stderr: "search failed because browser gateway is unavailable" }, "无法运行 Skill。")
    ).toBe("无法运行 Skill。");
  });

  it("hides structured agent errors without knowing their specific ids", () => {
    const error = Object.assign(new Error("Structured output validation failed: - root: Required"), {
      category: "SYSTEM",
      details: { value: "undefined" },
      domain: "AGENT",
      id: "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED"
    });

    expect(publicServerErrorMessage(error, "无法启动创作。")).toBe("无法启动创作。");
  });

  it("hides response bodies even when they contain redacted secrets", () => {
    expect(
      publicServerErrorMessage(
        {
          statusCode: 400,
          responseBody: JSON.stringify({
            error: {
              message: "Authorization: Bearer secret-token-1234567890 and api_key=abc123456789"
            }
          })
        },
        "无法启动创作。"
      )
    ).toBe("无法启动创作。");
  });

  it("returns a friendly context-length hint without exposing provider details", () => {
    expect(
      publicServerErrorMessage(
        {
          statusCode: 400,
          responseBody: JSON.stringify({
            error: {
              message:
                "无法生成下一版草稿：上游服务返回 400：对话内容太长，已超出当前模型的处理能力。model_id: moonshot-kimi-k2.6"
            }
          })
        },
        "无法生成下一版草稿。"
      )
    ).toBe("无法生成下一版草稿：内容较长，已尝试压缩后仍超出当前模型处理范围。");
  });

  it("hides unrelated internal server errors behind the fallback", () => {
    expect(publicServerErrorMessage(new Error("database constraint failed"), "无法启动创作。")).toBe(
      "无法启动创作。"
    );
  });
});
