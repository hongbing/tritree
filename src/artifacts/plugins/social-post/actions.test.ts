import { describe, expect, it } from "vitest";
import { replaceSocialPostSelection, SocialPostRewriteSelectionInputSchema } from "./actions";

describe("replaceSocialPostSelection", () => {
  it("accepts renderer rewrite requests before the AI replacement is produced", () => {
    expect(
      SocialPostRewriteSelectionInputSchema.parse({
        field: "body",
        instruction: "补一个真实工作细节",
        selectedText: "第二句",
        selectionEnd: 7,
        selectionStart: 4
      })
    ).toEqual({
      field: "body",
      instruction: "补一个真实工作细节",
      selectedText: "第二句",
      selectionEnd: 7,
      selectionStart: 4
    });
  });

  it("replaces the selected body range with the replacement text", () => {
    const payload = {
      title: "T",
      body: "第一句。第二句。",
      hashtags: ["#AI"],
      imagePrompt: "图"
    };

    expect(
      replaceSocialPostSelection(payload, {
        field: "body",
        instruction: "改得更清楚",
        replacementText: "改写句",
        selectedText: "第二句",
        selectionEnd: 7,
        selectionStart: 4
      })
    ).toEqual({
      title: "T",
      body: "第一句。改写句。",
      hashtags: ["#AI"],
      imagePrompt: "图"
    });
  });

  it("rejects a stale range when the selected text no longer matches", () => {
    const payload = {
      title: "T",
      body: "第一句。第二句。",
      hashtags: ["#AI"],
      imagePrompt: "图"
    };

    expect(() =>
      replaceSocialPostSelection(payload, {
        field: "body",
        instruction: "改得更清楚",
        replacementText: "改写句",
        selectedText: "第二句",
        selectionEnd: 3,
        selectionStart: 0
      })
    ).toThrow("Selected text no longer matches the artifact body.");
  });
});
