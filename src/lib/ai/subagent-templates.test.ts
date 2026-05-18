import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBAGENT_TEMPLATES,
  formatSubagentTemplateSummaries,
  getSubagentTemplate
} from "./subagent-templates";

describe("subagent templates", () => {
  it("only exposes material search as the predefined template", () => {
    expect(DEFAULT_SUBAGENT_TEMPLATES.map((template) => template.id)).toEqual(["material-search"]);
  });

  it("looks up material search by id", () => {
    expect(getSubagentTemplate("material-search")?.title).toBe("搜索资料");
  });

  it("does not expose removed content-work templates", () => {
    expect(getSubagentTemplate("material-organizer")).toBeUndefined();
    expect(getSubagentTemplate("independent-review")).toBeUndefined();
    expect(getSubagentTemplate("title-variants")).toBeUndefined();
    expect(getSubagentTemplate("platform-rewrite")).toBeUndefined();
  });

  it("formats summaries without undefined values", () => {
    const summary = formatSubagentTemplateSummaries();

    expect(summary).toContain("material-search");
    expect(summary).toContain("搜索资料");
    expect(summary).not.toContain("platform-rewrite");
    expect(summary).not.toContain("undefined");
  });
});
