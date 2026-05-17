import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBAGENT_TEMPLATES,
  formatSubagentTemplateSummaries,
  getSubagentTemplate
} from "./subagent-templates";

describe("subagent templates", () => {
  it("exposes the initial templates in the expected order", () => {
    expect(DEFAULT_SUBAGENT_TEMPLATES.map((template) => template.id)).toEqual([
      "material-search",
      "material-organizer",
      "independent-review",
      "title-variants",
      "platform-rewrite"
    ]);
  });

  it("looks up material search by id", () => {
    expect(getSubagentTemplate("material-search")?.title).toBe("素材搜索");
  });

  it("documents platform rewrite output as platform versions", () => {
    expect(getSubagentTemplate("platform-rewrite")?.expectedOutput).toContain("平台版本");
  });

  it("formats summaries without undefined values", () => {
    const summary = formatSubagentTemplateSummaries();

    expect(summary).toContain("material-search");
    expect(summary).toContain("素材搜索");
    expect(summary).toContain("platform-rewrite");
    expect(summary).not.toContain("undefined");
  });
});
